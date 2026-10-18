import { PipelinesService } from './pipelines.service';
import { PrismaService } from '../prisma/prisma.service';

const user = { userId: 'owner', tenantId: 'tenant', email: 'owner@example.test' };

function setup() {
  const tx = {
    dealStageHistory: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    deal: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    stage: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
    pipeline: { delete: jest.fn().mockResolvedValue({ id: 'old-workflow' }) },
  };
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
    pipeline: { findFirst: jest.fn().mockResolvedValue({ id: 'old-workflow' }) },
    $transaction: jest.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
  };
  return { tx, prisma, service: new PipelinesService(prisma as unknown as PrismaService) };
}

test('deleting an empty workflow removes history left by transferred deals before its stages', async () => {
  const { tx, prisma, service } = setup();
  await expect(service.remove('old-workflow', user)).resolves.toEqual({ id: 'old-workflow' });
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.dealStageHistory.deleteMany).toHaveBeenCalledWith({ where: {
    tenantId: 'tenant', OR: [
      { deal: { pipelineId: 'old-workflow' } },
      { fromStage: { pipelineId: 'old-workflow' } },
      { toStage: { pipelineId: 'old-workflow' } },
    ],
  } });
  expect(tx.dealStageHistory.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.stage.deleteMany.mock.invocationCallOrder[0]);
});

test('a stage deletion failure rejects the transaction and does not delete the pipeline', async () => {
  const { tx, service } = setup();
  tx.stage.deleteMany.mockRejectedValue(new Error('Foreign key violation'));
  await expect(service.remove('old-workflow', user)).rejects.toThrow('Foreign key violation');
  expect(tx.pipeline.delete).not.toHaveBeenCalled();
});

test('another tenant cannot delete the workflow', async () => {
  const { prisma, service } = setup();
  prisma.pipeline.findFirst.mockResolvedValue(null as never);
  await expect(service.remove('old-workflow', user)).rejects.toThrow('Pipeline not found');
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
