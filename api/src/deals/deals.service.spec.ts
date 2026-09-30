import { DealsService } from './deals.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DealsService', () => {
  it('creates only the first month of a package in the chosen workflow', async () => {
    const create = jest.fn().mockImplementation(({ data }) => ({ id: 'first-month', ...data }));
    const createCase = jest.fn().mockResolvedValue({ id: 'case-1' });
    const prisma = {
      pipeline: { findFirst: jest.fn().mockResolvedValue({ id: 'workflow-1' }) },
      stage: { findFirst: jest.fn().mockResolvedValue({
        id: 'open-stage', status: 'OPEN', name: 'Qualified',
      }) },
      $transaction: jest.fn().mockImplementation(async (callback) => callback({
        deal: {
          create,
          findFirst: jest.fn().mockImplementation(() => create.mock.results[0].value),
        },
        postSalesCase: { upsert: createCase },
      })),
    } as unknown as PrismaService;
    const service = new DealsService(prisma);
    (service as any).schemaCache = {
      checkedAt: Date.now(),
      caps: {
        hasClientId: true, hasClosingFields: true, hasOwnerId: true,
        hasProductTables: false, hasProposalFilePath: false, hasProbability: true,
      },
    };

    const result = await service.create({
      title: 'Monthly package', value: 1200, pipelineId: 'workflow-1',
      stageId: 'open-stage', recurrenceMonths: 3, recurrenceStartAt: '2027-01-31',
    }, { userId: 'owner-1', tenantId: 'tenant-1', email: 'owner@example.com' });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        pipelineId: 'workflow-1', stageId: 'open-stage', value: 1200,
        recurrenceIndex: 1, recurrenceMonths: 3, recurrenceGeneratedThrough: 1,
        recurrenceStageId: 'open-stage',
        recurrenceStartAt: new Date('2027-01-31T12:00:00.000Z'),
        expectedCloseDate: new Date('2027-01-31T12:00:00.000Z'),
      }),
    }));
    expect(result.recurrenceGroupId).toEqual(expect.any(String));
    expect(createCase).toHaveBeenCalledWith(expect.objectContaining({
      where: { dealId: 'first-month' },
      create: expect.objectContaining({
        name: 'Monthly package (Mes 1/3)',
        dueDate: new Date('2027-01-31T12:00:00.000Z'),
      }),
    }));
  });

  it('turns an existing open deal into the first monthly occurrence', async () => {
    const update = jest.fn().mockImplementation(({ data }) => ({ id: 'deal-1', ...data }));
    const createCase = jest.fn().mockResolvedValue({ id: 'case-1' });
    const tx = {
      deal: {
        update,
        findFirst: jest.fn().mockImplementation(() => ({
          id: 'deal-1', clientId: null,
          ownerId: 'owner-1', ...update.mock.results[0].value,
          title: 'Monthly package',
        })),
      },
      postSalesCase: { upsert: createCase },
    };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      stage: { findFirst: jest.fn().mockResolvedValue({ id: 'open-stage' }) },
      deal: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'deal-1', pipelineId: 'workflow-1', stageId: 'open-stage',
          status: 'OPEN', recurrenceGroupId: null,
        }),
      },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    } as unknown as PrismaService;
    const service = new DealsService(prisma);
    (service as any).schemaCache = {
      checkedAt: Date.now(),
      caps: {
        hasClientId: true, hasClosingFields: true, hasOwnerId: true,
        hasProductTables: false, hasProposalFilePath: false, hasProbability: true,
      },
    };

    await service.update('deal-1', {
      recurrenceMonths: 4, recurrenceStartAt: '2027-01-31',
    }, { userId: 'owner-1', tenantId: 'tenant-1', email: 'owner@example.com' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'deal-1' },
      data: expect.objectContaining({
        recurrenceIndex: 1, recurrenceMonths: 4, recurrenceGeneratedThrough: 1,
        recurrenceStageId: 'open-stage', recurrenceStartAt: new Date('2027-01-31T12:00:00.000Z'),
      }),
    }));
    expect(createCase).toHaveBeenCalledWith(expect.objectContaining({
      where: { dealId: 'deal-1' },
      create: expect.objectContaining({
        name: 'Monthly package (Mes 1/4)',
        dueDate: new Date('2027-01-31T12:00:00.000Z'),
      }),
    }));
  });

  it('duplicates a deal using the next copy number in its workflow', async () => {
    const create = jest.fn().mockImplementation(({ data }) => ({ id: 'new-copy', ...data }));
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: 1 }]),
      deal: {
        findMany: jest.fn().mockResolvedValue([
          { title: 'Proposal copy 1' }, { title: 'Proposal copy 2' },
        ]),
        create,
        findFirst: jest.fn().mockImplementation(() => create.mock.results[0].value),
      },
    };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      deal: { findFirst: jest.fn().mockResolvedValue({
        id: 'source', title: 'Proposal copy 1', value: 500,
        currency: 'USD', pipelineId: 'workflow-1', stageId: 'open-stage',
        status: 'OPEN', items: [],
      }) },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    } as unknown as PrismaService;
    const service = new DealsService(prisma);
    (service as any).schemaCache = {
      checkedAt: Date.now(),
      caps: {
        hasClientId: true, hasClosingFields: true, hasOwnerId: true,
        hasProductTables: false, hasProposalFilePath: false, hasProbability: true,
      },
    };

    const result = await service.duplicate('source', {
      userId: 'owner-1', tenantId: 'tenant-1', email: 'owner@example.com',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.deal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', pipelineId: 'workflow-1' }),
    }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ title: 'Proposal copy 3' }),
    }));
    expect(result.title).toBe('Proposal copy 3');
  });

  it('moves a deal to another pipeline during update', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ role: 'OWNER' }),
      },
      deal: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'deal-1',
          pipelineId: 'pipeline-post-sales',
          stageId: 'stage-post-sales',
        }),
      },
      pipeline: {
        findFirst: jest.fn().mockResolvedValue({ id: 'pipeline-new-sales' }),
      },
      stage: {
        findFirst: jest.fn().mockResolvedValue({ id: 'stage-new-sales' }),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;

    const tx = {
      dealStageHistory: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      deal: {
        update: jest.fn().mockResolvedValue({
          id: 'deal-1',
          title: 'Moved deal',
          pipelineId: 'pipeline-new-sales',
          stageId: 'stage-new-sales',
        }),
      },
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx),
    );

    const service = new DealsService(prisma);
    (service as any).schemaCache = {
      checkedAt: Date.now(),
      caps: {
        hasClientId: true,
        hasClosingFields: false,
        hasOwnerId: false,
        hasProductTables: false,
        hasProposalFilePath: false,
        hasProbability: true,
      },
    };

    const result = await service.update(
      'deal-1',
      {
        title: 'Moved deal',
        pipelineId: 'pipeline-new-sales',
        stageId: 'stage-new-sales',
      },
      { userId: 'user-1', tenantId: 'tenant-1', email: 'owner@example.com' },
    );

    expect(prisma.pipeline.findFirst).toHaveBeenCalledWith({
      where: { id: 'pipeline-new-sales', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(prisma.stage.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'stage-new-sales',
        tenantId: 'tenant-1',
        pipelineId: 'pipeline-new-sales',
      },
      select: { id: true, status: true, name: true },
    });
    expect(tx.dealStageHistory.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        dealId: 'deal-1',
        fromStageId: 'stage-post-sales',
        toStageId: 'stage-new-sales',
      },
    });
    expect(tx.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1' },
        data: expect.objectContaining({
          title: 'Moved deal',
          pipelineId: 'pipeline-new-sales',
          stageId: 'stage-new-sales',
        }),
      }),
    );
    expect(result).toEqual({
      id: 'deal-1',
      title: 'Moved deal',
      pipelineId: 'pipeline-new-sales',
      stageId: 'stage-new-sales',
    });
  });

  it('closes a deal as won and records the stage history atomically', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ role: 'MEMBER' }),
      },
      deal: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'deal-1',
          title: 'Enterprise renewal',
          clientId: 'client-1',
          ownerId: 'user-1',
          pipelineId: 'pipeline-1',
          stageId: 'stage-open',
          status: 'OPEN',
          followUpAt: null,
        }),
      },
      stage: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'stage-won',
          name: 'Won',
          status: 'WON',
        }),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const tx = {
      dealStageHistory: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      deal: {
        update: jest.fn().mockResolvedValue({
          id: 'deal-1',
          stageId: 'stage-won',
          status: 'WON',
          closedAt: new Date('2026-09-06T12:00:00.000Z'),
        }),
      },
      task: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx),
    );

    const service = new DealsService(prisma);
    (service as any).schemaCache = {
      checkedAt: Date.now(),
      caps: {
        hasClientId: true,
        hasClosingFields: true,
        hasOwnerId: true,
        hasProductTables: false,
        hasProposalFilePath: false,
        hasProbability: true,
      },
    };

    await service.close(
      'deal-1',
      {
        status: 'WON',
        finalValue: 12500,
        closedAt: '2026-09-06T12:00:00.000Z',
        note: 'Signed annual agreement',
      },
      { userId: 'user-1', tenantId: 'tenant-1', email: 'member@example.com' },
    );

    expect(prisma.deal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerId: 'user-1',
          tenantId: 'tenant-1',
        }),
      }),
    );
    expect(tx.dealStageHistory.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        dealId: 'deal-1',
        fromStageId: 'stage-open',
        toStageId: 'stage-won',
      },
    });
    expect(tx.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1' },
        data: expect.objectContaining({
          stageId: 'stage-won',
          status: 'WON',
          value: 12500,
          closeNote: 'Signed annual agreement',
          lossReason: null,
        }),
      }),
    );
  });

  it('requires a reason before closing a deal as lost', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ role: 'OWNER' }),
      },
      deal: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'deal-1',
          title: 'At-risk deal',
          clientId: null,
          pipelineId: 'pipeline-1',
          stageId: 'stage-open',
          status: 'OPEN',
          followUpAt: null,
        }),
      },
      stage: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const service = new DealsService(prisma);
    (service as any).schemaCache = {
      checkedAt: Date.now(),
      caps: {
        hasClientId: true,
        hasClosingFields: true,
        hasOwnerId: true,
        hasProductTables: false,
        hasProposalFilePath: false,
        hasProbability: true,
      },
    };

    await expect(
      service.close(
        'deal-1',
        { status: 'LOST' },
        { userId: 'owner-1', tenantId: 'tenant-1', email: 'owner@example.com' },
      ),
    ).rejects.toThrow('Loss reason is required');
    expect(prisma.stage.findFirst).not.toHaveBeenCalled();
  });

  it('reopens a closed deal into its previous open stage for undo', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ role: 'OWNER' }),
      },
      deal: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'deal-1',
          pipelineId: 'pipeline-1',
          stageId: 'stage-won',
        }),
      },
      stage: {
        findFirst: jest.fn().mockResolvedValue({ id: 'stage-open' }),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const tx = {
      dealStageHistory: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      deal: {
        update: jest.fn().mockResolvedValue({
          id: 'deal-1',
          stageId: 'stage-open',
          status: 'OPEN',
          closedAt: null,
        }),
      },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx),
    );
    const service = new DealsService(prisma);
    (service as any).schemaCache = {
      checkedAt: Date.now(),
      caps: {
        hasClientId: true,
        hasClosingFields: true,
        hasOwnerId: true,
        hasProductTables: false,
        hasProposalFilePath: false,
        hasProbability: true,
      },
    };

    await service.reopen(
      'deal-1',
      { stageId: 'stage-open' },
      { userId: 'owner-1', tenantId: 'tenant-1', email: 'owner@example.com' },
    );

    expect(prisma.stage.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'stage-open',
        tenantId: 'tenant-1',
        pipelineId: 'pipeline-1',
        status: 'OPEN',
      },
      select: { id: true },
    });
    expect(tx.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stageId: 'stage-open',
          status: 'OPEN',
          closedAt: null,
          lossReason: null,
        }),
      }),
    );
  });
});
