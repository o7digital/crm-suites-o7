import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { RequestUser } from '../common/user.decorator';
import { requireWorkspaceAdmin } from '../common/workspace-permissions';

@Injectable()
export class PipelinesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePipelineDto, user: RequestUser) {
    await requireWorkspaceAdmin(this.prisma, user);
    if (dto.isDefault) {
      await this.prisma.pipeline.updateMany({
        where: { tenantId: user.tenantId },
        data: { isDefault: false },
      });
    }

    return this.prisma.pipeline.create({
      data: {
        name: dto.name,
        isDefault: dto.isDefault ?? false,
        tenantId: user.tenantId,
      },
    });
  }

  async findAll(user: RequestUser) {
    return this.prisma.pipeline.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string, user: RequestUser) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    return pipeline;
  }

  async update(id: string, dto: UpdatePipelineDto, user: RequestUser) {
    await requireWorkspaceAdmin(this.prisma, user);
    await this.ensureBelongs(id, user);
    if (dto.isDefault) {
      await this.prisma.pipeline.updateMany({
        where: { tenantId: user.tenantId },
        data: { isDefault: false },
      });
    }
    return this.prisma.pipeline.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, user: RequestUser) {
    await requireWorkspaceAdmin(this.prisma, user);
    await this.ensureBelongs(id, user);

    // Transferred deals can still reference this workflow's stages in their history.
    // Remove those references before the stages, and roll everything back on failure.
    return this.prisma.$transaction(async (tx) => {
      await tx.dealStageHistory.deleteMany({
        where: {
          tenantId: user.tenantId,
          OR: [
            { deal: { pipelineId: id } },
            { fromStage: { pipelineId: id } },
            { toStage: { pipelineId: id } },
          ],
        },
      });
      await tx.deal.deleteMany({ where: { pipelineId: id, tenantId: user.tenantId } });
      await tx.stage.deleteMany({ where: { pipelineId: id, tenantId: user.tenantId } });
      return tx.pipeline.delete({ where: { id } });
    });
  }

  private async ensureBelongs(id: string, user: RequestUser) {
    const exists = await this.prisma.pipeline.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Pipeline not found');
  }
}
