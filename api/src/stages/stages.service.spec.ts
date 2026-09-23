import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StagesService } from './stages.service';

const user = { userId: 'u1', tenantId: 't1', email: 'admin@example.com' };

function setup(stage = { id: 's1', status: 'OPEN', probability: 0.5 }) {
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue({ role: 'ADMIN' }) },
    stage: {
      findFirst: jest.fn().mockResolvedValue(stage),
      update: jest.fn().mockResolvedValue({ ...stage, name: 'Updated' }),
    },
    deal: { count: jest.fn().mockResolvedValue(0) },
  };

  return {
    prisma,
    service: new StagesService(prisma as unknown as PrismaService),
  };
}

describe('StagesService', () => {
  it('rejects a status change when the stage contains deals', async () => {
    const { prisma, service } = setup();
    prisma.deal.count.mockResolvedValue(2);

    await expect(service.update('s1', { status: 'WON', probability: 1 }, user)).rejects.toThrow(
      new BadRequestException(
        'Stage status cannot be changed while it contains deals. Move deals first.',
      ),
    );

    expect(prisma.deal.count).toHaveBeenCalledWith({
      where: { stageId: 's1', tenantId: 't1' },
    });
    expect(prisma.stage.update).not.toHaveBeenCalled();
  });

  it('updates a stage without counting deals when its status does not change', async () => {
    const { prisma, service } = setup();

    await expect(service.update('s1', { name: 'Updated' }, user)).resolves.toEqual({
      id: 's1',
      status: 'OPEN',
      probability: 0.5,
      name: 'Updated',
    });

    expect(prisma.deal.count).not.toHaveBeenCalled();
    expect(prisma.stage.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { name: 'Updated' },
    });
  });
});
