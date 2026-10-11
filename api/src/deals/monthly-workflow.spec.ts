import { monthlyWorkflow } from './monthly-workflow';
import { Prisma } from '@prisma/client';

describe('monthly workflow', () => {
  it('reuses the tenant Post Sale and its duration columns without duplicates', async () => {
    const stages = [12, 24, 36, 48, 60, 72].map((months, position) => ({
      id: `stage-${months}`,
      name: `${months} Months`,
      status: 'OPEN',
      position,
    }));
    stages.push(
      { id: 'won', name: 'Won', status: 'WON', position: 7 },
      { id: 'lost', name: 'Lost', status: 'LOST', position: 8 },
    );
    const tx = {
      $queryRaw: jest.fn(),
      pipeline: {
        findFirst: jest.fn().mockResolvedValue({ id: 'post-sale' }),
        create: jest.fn(),
      },
      stage: {
        findMany: jest.fn().mockResolvedValue(stages),
        create: jest.fn(),
      },
    };
    expect(
      await monthlyWorkflow(
        tx as unknown as Prisma.TransactionClient,
        'tenant-1',
        72,
      ),
    ).toEqual({ pipelineId: 'post-sale', stageId: 'stage-72' });
    expect(tx.pipeline.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          name: { equals: 'Post Sale', mode: 'insensitive' },
        },
      }),
    );
    expect(tx.stage.create).not.toHaveBeenCalled();
    expect(tx.pipeline.create).not.toHaveBeenCalled();
  });
  it('sets up six standard durations and retains a legacy custom duration', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      pipeline: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      },
      stage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({
            id: `stage-${data.name}`,
            ...data,
          })),
      },
    };
    const result = await monthlyWorkflow(
      tx as unknown as Prisma.TransactionClient,
      'tenant-2',
      3,
    );
    expect(result).toEqual({ pipelineId: 'new', stageId: 'stage-3 months' });
    expect(tx.stage.create).toHaveBeenCalledTimes(9);
    expect(tx.pipeline.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-2', name: 'Post Sale' },
    });
  });
});
