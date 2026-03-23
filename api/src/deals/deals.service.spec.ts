import { DealsService } from './deals.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DealsService', () => {
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
      select: { id: true },
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
});
