import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { FxService } from '../fx/fx.service';

describe('DashboardService', () => {
  it('uses weighted deal amounts for the open pipeline KPI', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ role: 'OWNER' }),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        { column_name: 'ownerId' },
        { column_name: 'probability' },
      ]),
      client: {
        count: jest.fn().mockResolvedValue(50),
      },
      task: {
        groupBy: jest.fn().mockResolvedValue([{ status: 'PENDING', _count: 5 }]),
      },
      deal: {
        findMany: jest.fn().mockResolvedValue([
          {
            value: 40_000_000,
            currency: 'MXN',
            probability: 0.01,
            stage: { probability: 0.1, status: 'OPEN' },
          },
          {
            value: 1_000,
            currency: 'USD',
            probability: null,
            stage: { probability: 0.5, status: 'OPEN' },
          },
        ]),
        count: jest.fn().mockResolvedValue(64),
      },
      invoice: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: null },
          _count: { _all: 0 },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const fx = {
      getUsdRates: jest.fn().mockResolvedValue({
        provider: 'frankfurter',
        base: 'USD',
        date: '2026-03-23',
        rates: { USD: 1, MXN: 20 },
        fetchedAt: Date.now(),
      }),
      toUsd: jest.fn((amount: number, currency: string, snapshot) => {
        const cur = (currency || 'USD').toUpperCase();
        if (cur === 'USD') return amount;
        const rate = snapshot.rates[cur];
        if (!Number.isFinite(rate) || rate <= 0) return null;
        return amount / rate;
      }),
    } as unknown as FxService;

    const service = new DashboardService(prisma, fx);

    const result = await service.getSnapshot({
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'owner@example.com',
    });

    expect(result.leads.open).toBe(2);
    expect(result.leads.total).toBe(64);
    expect(result.leads.openByCurrency).toEqual([
      { currency: 'MXN', count: 1, amount: 400_000 },
      { currency: 'USD', count: 1, amount: 500 },
    ]);
    expect(result.leads.amountUsd).toBe(500);
    expect(result.leads.openValueUsd).toBe(20_500);
  });
});
