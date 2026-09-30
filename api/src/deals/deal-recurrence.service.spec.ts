import { DealRecurrenceService } from './deal-recurrence.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DealRecurrenceService', () => {
  it('creates only due months in the original workflow and does not repeat them', async () => {
    const root = {
      id: 'first-month',
      tenantId: 'tenant-1',
      pipelineId: 'workflow-1',
      recurrenceStageId: 'open-stage',
      recurrenceGroupId: 'series-1',
      recurrenceIndex: 1,
      recurrenceMonths: 3,
      recurrenceStartAt: new Date('2027-01-31T12:00:00.000Z'),
      recurrenceGeneratedThrough: 1,
      title: 'Monthly package',
      value: 1200,
      currency: 'MXN',
      clientId: 'client-1',
      ownerId: 'owner-1',
      items: [{ productId: 'product-1', quantity: 1, unitPrice: 1200 }],
    };
    const created: Array<Record<string, unknown>> = [];
    const createItems = jest.fn().mockResolvedValue(undefined);
    const tx = {
      deal: {
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          if (root.recurrenceGeneratedThrough !== where.recurrenceGeneratedThrough) return { count: 0 };
          root.recurrenceGeneratedThrough = data.recurrenceGeneratedThrough;
          return { count: 1 };
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          created.push(data);
          return { id: `month-${created.length + 1}` };
        }),
      },
      dealItem: { createMany: createItems },
    };
    const prisma = {
      deal: { findMany: jest.fn().mockImplementation(() => [root]) },
      stage: { findFirst: jest.fn().mockResolvedValue({ id: 'open-stage', probability: 0.5 }) },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    } as unknown as PrismaService;
    const service = new DealRecurrenceService(prisma);

    expect(await service.runOnce(new Date('2027-04-01T00:00:00.000Z'))).toBe(2);
    expect(created).toEqual([
      expect.objectContaining({
        tenantId: 'tenant-1', pipelineId: 'workflow-1', stageId: 'open-stage',
        recurrenceIndex: 2, status: 'OPEN',
        expectedCloseDate: new Date('2027-02-28T12:00:00.000Z'),
      }),
      expect.objectContaining({
        tenantId: 'tenant-1', pipelineId: 'workflow-1', stageId: 'open-stage',
        recurrenceIndex: 3,
        expectedCloseDate: new Date('2027-03-31T12:00:00.000Z'),
      }),
    ]);
    expect(createItems).toHaveBeenCalledTimes(2);
    expect(await service.runOnce(new Date('2027-04-02T00:00:00.000Z'))).toBe(0);
    expect(created).toHaveLength(2);
  });
});
