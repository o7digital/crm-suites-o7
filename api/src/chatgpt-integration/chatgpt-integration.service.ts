import { BadRequestException, Injectable } from '@nestjs/common';
import { endOfMonth, startOfMonth, startOfWeek } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';

type DealStatus = 'OPEN' | 'WON' | 'LOST';

@Injectable()
export class ChatGptIntegrationService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string) {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const [tenant, clientCount, newClientsThisWeek, tasks, deals, invoices] =
      await Promise.all([
        this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, crmDisplayCurrency: true },
        }),
        this.prisma.client.count({ where: { tenantId } }),
        this.prisma.client.count({
          where: { tenantId, createdAt: { gte: weekStart } },
        }),
        this.prisma.task.findMany({
          where: { tenantId, status: { not: 'DONE' } },
          select: { status: true, dueDate: true },
        }),
        this.prisma.deal.findMany({
          where: { tenantId },
          select: {
            value: true,
            currency: true,
            stage: { select: { status: true } },
          },
        }),
        this.prisma.invoice.findMany({
          where: { tenantId },
          select: { amount: true, currency: true, status: true, dueDate: true },
        }),
      ]);

    const dealTotals = this.groupAmounts(
      deals.map((deal) => ({
        amount: Number(deal.value),
        currency: deal.currency,
        status: deal.stage.status,
      })),
    );
    const invoiceTotals = this.groupAmounts(
      invoices.map((invoice) => ({
        amount: Number(invoice.amount),
        currency: invoice.currency,
        status: invoice.status,
      })),
    );

    return {
      generatedAt: now.toISOString(),
      workspace: {
        name: tenant?.name || 'O7 Digital',
        displayCurrency: tenant?.crmDisplayCurrency || 'MXN',
      },
      clients: { total: clientCount, newThisWeek: newClientsThisWeek },
      tasks: {
        open: tasks.length,
        overdue: tasks.filter((task) => task.dueDate && task.dueDate < now)
          .length,
      },
      deals: {
        counts: this.countStatuses(deals.map((deal) => deal.stage.status)),
        totalsByCurrencyAndStatus: dealTotals,
      },
      invoices: {
        counts: this.countStatuses(invoices.map((invoice) => invoice.status)),
        totalsByCurrencyAndStatus: invoiceTotals,
        dueWithin30Days: invoices.filter((invoice) => {
          if (!invoice.dueDate) return false;
          const days = (invoice.dueDate.getTime() - now.getTime()) / 86_400_000;
          return days >= 0 && days <= 30;
        }).length,
        paymentTrackingAvailable: false,
      },
    };
  }

  async clients(tenantId: string, requestedLimit?: string) {
    const limit = this.limit(requestedLimit);
    const clients = await this.prisma.client.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        firstName: true,
        name: true,
        company: true,
        clientStatus: true,
        email: true,
        phone: true,
        owner: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      generatedAt: new Date().toISOString(),
      count: clients.length,
      clients,
    };
  }

  async deals(
    tenantId: string,
    requestedStatus?: string,
    requestedLimit?: string,
  ) {
    const status = this.dealStatus(requestedStatus);
    const deals = await this.prisma.deal.findMany({
      where: { tenantId, ...(status ? { stage: { status } } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: this.limit(requestedLimit),
      select: {
        id: true,
        title: true,
        value: true,
        currency: true,
        probability: true,
        expectedCloseDate: true,
        client: { select: { id: true, name: true, company: true } },
        owner: { select: { id: true, name: true } },
        pipeline: { select: { id: true, name: true } },
        stage: {
          select: { id: true, name: true, status: true, probability: true },
        },
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      generatedAt: new Date().toISOString(),
      count: deals.length,
      deals: deals.map((deal) => ({ ...deal, value: Number(deal.value) })),
    };
  }

  async tasks(tenantId: string, overdueOnly?: string, requestedLimit?: string) {
    const now = new Date();
    const onlyOverdue = overdueOnly === 'true';
    const tasks = await this.prisma.task.findMany({
      where: {
        tenantId,
        ...(onlyOverdue
          ? { status: { not: 'DONE' as const }, dueDate: { lt: now } }
          : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: this.limit(requestedLimit),
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        client: { select: { id: true, name: true, company: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      generatedAt: now.toISOString(),
      count: tasks.length,
      tasks: tasks.map((task) => ({
        ...task,
        overdue: Boolean(
          task.status !== 'DONE' && task.dueDate && task.dueDate < now,
        ),
      })),
    };
  }

  async invoices(
    tenantId: string,
    dueWithinDays?: string,
    requestedLimit?: string,
  ) {
    const now = new Date();
    const days = this.days(dueWithinDays);
    const end = new Date(now.getTime() + days * 86_400_000);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        ...(dueWithinDays ? { dueDate: { gte: now, lte: end } } : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: this.limit(requestedLimit),
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        issuedDate: true,
        dueDate: true,
        client: { select: { id: true, name: true, company: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      generatedAt: now.toISOString(),
      count: invoices.length,
      paymentTrackingAvailable: false,
      invoices: invoices.map((invoice) => ({
        ...invoice,
        amount: Number(invoice.amount),
      })),
    };
  }

  async forecast(tenantId: string, month?: string) {
    const anchor = this.month(month);
    const from = startOfMonth(anchor);
    const to = endOfMonth(anchor);
    const deals = await this.prisma.deal.findMany({
      where: {
        tenantId,
        stage: { status: 'OPEN' },
        expectedCloseDate: { gte: from, lte: to },
      },
      orderBy: { expectedCloseDate: 'asc' },
      select: {
        id: true,
        title: true,
        value: true,
        currency: true,
        probability: true,
        expectedCloseDate: true,
        stage: { select: { id: true, name: true, probability: true } },
        pipeline: { select: { id: true, name: true } },
      },
    });

    const totals = new Map<
      string,
      { total: number; weighted: number; count: number }
    >();
    for (const deal of deals) {
      const currency = deal.currency.toUpperCase();
      const row = totals.get(currency) || { total: 0, weighted: 0, count: 0 };
      const value = Number(deal.value);
      const probability = deal.probability ?? deal.stage.probability ?? 0;
      row.total += value;
      row.weighted += value * probability;
      row.count += 1;
      totals.set(currency, row);
    }

    return {
      generatedAt: new Date().toISOString(),
      period: { from: from.toISOString(), to: to.toISOString() },
      byCurrency: Object.fromEntries(totals),
      deals: deals.map((deal) => ({ ...deal, value: Number(deal.value) })),
    };
  }

  async pipeline(tenantId: string) {
    const [pipelines, deals] = await Promise.all([
      this.prisma.pipeline.findMany({
        where: { tenantId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          isDefault: true,
          stages: {
            where: { tenantId },
            orderBy: { position: 'asc' },
            select: {
              id: true,
              name: true,
              position: true,
              probability: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.deal.findMany({
        where: { tenantId },
        select: {
          pipelineId: true,
          stageId: true,
          value: true,
          currency: true,
        },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      pipelines: pipelines.map((pipeline) => ({
        ...pipeline,
        stages: pipeline.stages.map((stage) => {
          const stageDeals = deals.filter((deal) => deal.stageId === stage.id);
          return {
            ...stage,
            dealCount: stageDeals.length,
            totalsByCurrency: this.simpleCurrencyTotals(stageDeals),
          };
        }),
      })),
    };
  }

  private limit(raw?: string) {
    if (!raw) return 50;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 100',
      );
    }
    return value;
  }

  private days(raw?: string) {
    if (!raw) return 30;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 365) {
      throw new BadRequestException(
        'dueWithinDays must be an integer between 1 and 365',
      );
    }
    return value;
  }

  private month(raw?: string) {
    if (!raw) return new Date();
    if (!/^\d{4}-\d{2}$/.test(raw))
      throw new BadRequestException('month must use YYYY-MM');
    const value = new Date(`${raw}-01T00:00:00.000Z`);
    if (Number.isNaN(value.getTime()))
      throw new BadRequestException('Invalid month');
    return value;
  }

  private dealStatus(raw?: string): DealStatus | undefined {
    if (!raw) return undefined;
    const status = raw.toUpperCase();
    if (!['OPEN', 'WON', 'LOST'].includes(status)) {
      throw new BadRequestException('status must be OPEN, WON or LOST');
    }
    return status as DealStatus;
  }

  private countStatuses(statuses: string[]) {
    return statuses.reduce<Record<string, number>>((counts, status) => {
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});
  }

  private groupAmounts(
    rows: Array<{ amount: number; currency: string; status: string }>,
  ) {
    const result: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      const currency = row.currency.toUpperCase();
      result[currency] ||= {};
      result[currency][row.status] =
        (result[currency][row.status] || 0) + row.amount;
    }
    return result;
  }

  private simpleCurrencyTotals(
    rows: Array<{ value: unknown; currency: string }>,
  ) {
    return rows.reduce<Record<string, number>>((totals, row) => {
      const currency = row.currency.toUpperCase();
      totals[currency] = (totals[currency] || 0) + Number(row.value);
      return totals;
    }, {});
  }
}
