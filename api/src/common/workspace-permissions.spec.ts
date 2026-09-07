import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PipelinesService } from '../pipelines/pipelines.service';
import { StagesService } from '../stages/stages.service';
import { PrismaService } from '../prisma/prisma.service';

const user = { userId: 'u1', tenantId: 't1', email: 'member@example.com' };
function setup(role: string | null) {
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue(role ? { role } : null) },
    pipeline: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    stage: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
  return { prisma, pipelines: new PipelinesService(prisma as unknown as PrismaService), stages: new StagesService(prisma as unknown as PrismaService) };
}

describe('pipeline and stage authorization', () => {
  it.each(['MEMBER', null])('rejects all configuration writes for role %s before accessing business data', async (role) => {
    const { prisma, pipelines, stages } = setup(role);
    for (const operation of [
      () => pipelines.create({ name: 'Pipeline' }, user),
      () => pipelines.update('p1', {}, user),
      () => pipelines.remove('p1', user),
      () => stages.create({ name: 'Stage', pipelineId: 'p1' }, user),
      () => stages.update('s1', {}, user),
      () => stages.remove('s1', user),
      () => stages.reorder({ items: [{ id: 's1', position: 1 }] }, user),
    ]) await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.pipeline.findFirst).not.toHaveBeenCalled();
    expect(prisma.stage.findFirst).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'OWNER'])('keeps tenant boundaries for role %s', async (role) => {
    const { prisma, pipelines, stages } = setup(role);
    await expect(pipelines.update('foreign-pipeline', {}, user)).rejects.toBeInstanceOf(NotFoundException);
    await expect(stages.update('foreign-stage', {}, user)).rejects.toBeInstanceOf(NotFoundException);
    await expect(stages.create({ name: 'Stage', pipelineId: 'foreign-pipeline' }, user)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.pipeline.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign-pipeline', tenantId: 't1' } }));
    expect(prisma.stage.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign-stage', tenantId: 't1' } });
    expect(prisma.pipeline.update).not.toHaveBeenCalled();
    expect(prisma.stage.update).not.toHaveBeenCalled();
  });

  it('lists stages without repairing or creating records', async () => {
    const { prisma, stages } = setup('MEMBER');
    await expect(stages.findAll('p1', user)).resolves.toEqual([]);
    expect(prisma.stage.findMany).toHaveBeenCalledWith({ where: { tenantId: 't1', pipelineId: 'p1' }, orderBy: { position: 'asc' } });
    expect(prisma.pipeline.findFirst).not.toHaveBeenCalled();
    expect(prisma.stage.create).not.toHaveBeenCalled();
    expect(prisma.stage.update).not.toHaveBeenCalled();
  });
});
