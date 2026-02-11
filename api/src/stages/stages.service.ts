import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { ReorderStagesDto } from './dto/reorder-stages.dto';
import { RequestUser } from '../common/user.decorator';

@Injectable()
export class StagesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateStageDto, user: RequestUser) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: dto.pipelineId, tenantId: user.tenantId },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');

    let position = dto.position;
    if (position === undefined || position === null) {
      const max = await this.prisma.stage.aggregate({
        where: { pipelineId: dto.pipelineId, tenantId: user.tenantId },
        _max: { position: true },
      });
      position = (max._max.position ?? 0) + 1;
    }

    return this.prisma.stage.create({
      data: {
        name: dto.name,
        position,
        probability: dto.probability ?? 0,
        status: dto.status ?? 'OPEN',
        tenantId: user.tenantId,
        pipelineId: dto.pipelineId,
      },
    });
  }

  async findAll(pipelineId: string | undefined, user: RequestUser) {
    if (pipelineId) {
      await this.ensureNewSalesContractStage(pipelineId, user);
    }
    return this.prisma.stage.findMany({
      where: {
        tenantId: user.tenantId,
        ...(pipelineId ? { pipelineId } : {}),
      },
      orderBy: { position: 'asc' },
    });
  }

  async findOne(id: string, user: RequestUser) {
    const stage = await this.prisma.stage.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        pipeline: { select: { id: true, name: true, isDefault: true } },
      },
    });
    if (!stage) throw new NotFoundException('Stage not found');
    return stage;
  }

  async update(id: string, dto: UpdateStageDto, user: RequestUser) {
    await this.ensureBelongs(id, user);
    return this.prisma.stage.update({
      where: { id },
      data: dto,
    });
  }

  async reorder(dto: ReorderStagesDto, user: RequestUser) {
    const ids = dto.items.map((item) => item.id);
    const stages = await this.prisma.stage.findMany({
      where: { id: { in: ids }, tenantId: user.tenantId },
      select: { id: true },
    });
    if (stages.length !== ids.length) {
      throw new NotFoundException('One or more stages not found');
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.stage.update({
          where: { id: item.id },
          data: { position: item.position },
        }),
      ),
    );

    return { ok: true };
  }

  async remove(id: string, user: RequestUser) {
    await this.ensureBelongs(id, user);
    const deals = await this.prisma.deal.count({ where: { stageId: id, tenantId: user.tenantId } });
    if (deals > 0) {
      throw new BadRequestException('Stage has deals. Move deals before deleting.');
    }
    return this.prisma.stage.delete({ where: { id } });
  }

  private async ensureBelongs(id: string, user: RequestUser) {
    const exists = await this.prisma.stage.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!exists) throw new NotFoundException('Stage not found');
  }

  // Safety net for existing tenants where bootstrap did not run after adding this stage.
  private async ensureNewSalesContractStage(pipelineId: string, user: RequestUser) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, tenantId: user.tenantId },
      select: { id: true, name: true },
    });
    if (!pipeline || pipeline.name !== 'New Sales') return;

    const stages = await this.prisma.stage.findMany({
      where: { tenantId: user.tenantId, pipelineId },
      select: { id: true, name: true, position: true, status: true, probability: true },
      orderBy: { position: 'asc' },
    });
    if (stages.length === 0) return;

    const byName = new Map(stages.map((s) => [s.name, s]));
    const verbalYes = byName.get('Verbal yes');
    const won = byName.get('Won');
    const contract = byName.get('Contract');
    if (!verbalYes || !won) return;

    if (!contract) {
      // Insert before "Won" and shift following stages.
      await this.prisma.stage.updateMany({
        where: { tenantId: user.tenantId, pipelineId, position: { gte: won.position } },
        data: { position: { increment: 1 } },
      });
      await this.prisma.stage.create({
        data: {
          tenantId: user.tenantId,
          pipelineId,
          name: 'Contract',
          status: 'OPEN',
          probability: 0.95,
          position: won.position,
        },
      });
      return;
    }

    const patch: Partial<{ status: 'OPEN' | 'WON' | 'LOST'; probability: number }> = {};
    if (contract.status !== 'OPEN') patch.status = 'OPEN';
    if (contract.probability !== 0.95) patch.probability = 0.95;
    if (Object.keys(patch).length > 0) {
      await this.prisma.stage.update({ where: { id: contract.id }, data: patch });
    }
  }
}
