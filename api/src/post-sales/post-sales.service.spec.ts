import { PostSalesService } from './post-sales.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PostSalesService', () => {
  it('adds an existing monthly deal to Post Venta once', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      deal: { findMany: jest.fn().mockResolvedValue([{
        id: 'month-1', title: 'Plan', clientId: 'client-1', ownerId: 'owner-1',
        recurrenceIndex: 1, recurrenceMonths: 12,
        expectedCloseDate: new Date('2026-09-30T12:00:00.000Z'),
      }]) },
      postSalesCase: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany,
      },
    } as unknown as PrismaService;
    const service = new PostSalesService(prisma);
    const user = { userId: 'owner-1', tenantId: 'tenant-1', email: 'owner@example.com' };

    await service.backfillWonDeals(user);

    expect(prisma.deal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ recurrenceGroupId: { not: null } }]),
      }),
    }));
    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        dealId: 'month-1', name: 'Plan (Mes 1/12)',
        dueDate: new Date('2026-09-30T12:00:00.000Z'),
      })],
      skipDuplicates: true,
    });
  });
});
