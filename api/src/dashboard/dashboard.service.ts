import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { subDays } from 'date-fns';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSnapshot(user: RequestUser) {
    const tenantId = user.tenantId;
    const [clientCount, taskCounts, openLeadsByCurrency, leadTotalCount, invoiceAgg, recentInvoices] =
      await Promise.all([
        this.prisma.client.count({ where: { tenantId } }),
        this.prisma.task.groupBy({
          by: ['status'],
          where: { tenantId },
          _count: true,
        }),
        // Pipeline value is not directly summable across currencies, so we provide
        // a per-currency breakdown for open deals.
        this.prisma.deal.groupBy({
          by: ['currency'],
          where: {
            tenantId,
            stage: { status: 'OPEN' },
          },
          _sum: { value: true },
          _count: { _all: true },
        }),
        this.prisma.deal.count({
          where: { tenantId },
        }),
        this.prisma.invoice.aggregate({
          where: { tenantId },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.invoice.findMany({
          where: { tenantId, createdAt: { gte: subDays(new Date(), 30) } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

    const taskByStatus: Record<string, number> = {};
    for (const { status, _count } of taskCounts) {
      taskByStatus[status] = _count;
    }

    const openByCurrency = openLeadsByCurrency.map((row) => ({
      currency: row.currency,
      count: row._count._all,
      amount: row._sum.value ? Number(row._sum.value) : 0,
    }));
    const openCount = openByCurrency.reduce((sum, row) => sum + row.count, 0);
    const usdRow = openByCurrency.find((row) => row.currency === 'USD');

    return {
      clients: clientCount,
      tasks: taskByStatus,
      leads: {
        open: openCount,
        total: leadTotalCount,
        openByCurrency,
        openUsd: usdRow?.count ?? 0,
        amountUsd: usdRow?.amount ?? 0,
      },
      invoices: {
        total: invoiceAgg._count._all,
        amount: invoiceAgg._sum.amount ? Number(invoiceAgg._sum.amount) : 0,
        recent: recentInvoices,
      },
    };
  }
}
