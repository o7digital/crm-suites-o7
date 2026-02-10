import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { subDays } from 'date-fns';
import { FxService } from '../fx/fx.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private fx: FxService,
  ) {}

  private schemaCache: { checkedAt: number; hasOwnerId: boolean } | null = null;

  private async hasDealOwnerId(): Promise<boolean> {
    const now = Date.now();
    if (this.schemaCache && now - this.schemaCache.checkedAt < 60_000) {
      return this.schemaCache.hasOwnerId;
    }
    const cols = await this.prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Deal'
        AND column_name IN ('ownerId')
    `;
    const hasOwnerId = cols.some((c) => c.column_name === 'ownerId');
    this.schemaCache = { checkedAt: now, hasOwnerId };
    return hasOwnerId;
  }

  private async getUserRole(user: RequestUser): Promise<'OWNER' | 'ADMIN' | 'MEMBER'> {
    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { role: true },
    });
    return (dbUser?.role as 'OWNER' | 'ADMIN' | 'MEMBER' | undefined) ?? 'MEMBER';
  }

  async getSnapshot(user: RequestUser) {
    const tenantId = user.tenantId;
    const role = await this.getUserRole(user);
    const hasOwnerId = await this.hasDealOwnerId();
    const dealVisibilityWhere = hasOwnerId && role === 'MEMBER' ? { ownerId: user.userId } : {};

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
            ...dealVisibilityWhere,
          },
          _sum: { value: true },
          _count: { _all: true },
        }),
        this.prisma.deal.count({
          where: { tenantId, ...dealVisibilityWhere },
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

    let openValueUsd = usdRow?.amount ?? 0;
    let fxDate: string | null = null;
    let fxProvider: string | null = null;
    let fxMissingCurrencies: string[] = [];
    let fxError: string | null = null;

    try {
      const snapshot = await this.fx.getUsdRates();
      fxDate = snapshot.date;
      fxProvider = snapshot.provider;

      const missing = new Set<string>();
      openValueUsd = openByCurrency.reduce((sum, row) => {
        const converted = this.fx.toUsd(row.amount, row.currency, snapshot);
        if (converted === null) {
          missing.add((row.currency || '').toUpperCase() || 'UNKNOWN');
          return sum;
        }
        return sum + converted;
      }, 0);
      fxMissingCurrencies = Array.from(missing).filter((cur) => cur && cur !== 'USD').sort();
    } catch (err) {
      fxError = err instanceof Error ? err.message : 'Unable to load FX rates';
      // Fall back to USD-only totals so the dashboard remains usable.
      openValueUsd = usdRow?.amount ?? 0;
    }

    return {
      clients: clientCount,
      tasks: taskByStatus,
      leads: {
        open: openCount,
        total: leadTotalCount,
        openByCurrency,
        openUsd: usdRow?.count ?? 0,
        amountUsd: usdRow?.amount ?? 0,
        openValueUsd,
        fx: {
          date: fxDate,
          provider: fxProvider,
          missingCurrencies: fxMissingCurrencies,
          error: fxError,
        },
      },
      invoices: {
        total: invoiceAgg._count._all,
        amount: invoiceAgg._sum.amount ? Number(invoiceAgg._sum.amount) : 0,
        recent: recentInvoices,
      },
    };
  }
}
