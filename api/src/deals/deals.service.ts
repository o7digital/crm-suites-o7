import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { MoveStageDto } from './dto/move-stage.dto';

@Injectable()
export class DealsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateDealDto, user: RequestUser) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: dto.pipelineId, tenantId: user.tenantId },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');

    let stageId = dto.stageId;
    if (stageId) {
      const stage = await this.prisma.stage.findFirst({
        where: { id: stageId, tenantId: user.tenantId, pipelineId: dto.pipelineId },
      });
      if (!stage) throw new BadRequestException('Stage not found for pipeline');
    } else {
      const stage = await this.prisma.stage.findFirst({
        where: { tenantId: user.tenantId, pipelineId: dto.pipelineId },
        orderBy: { position: 'asc' },
      });
      if (!stage) throw new BadRequestException('Pipeline has no stages');
      stageId = stage.id;
    }

    const uniqueProductIds = Array.from(new Set((dto.productIds ?? []).map((x) => x.trim()).filter(Boolean)));
    const productsById = new Map<string, { id: string; price: Prisma.Decimal | null }>();

    if (uniqueProductIds.length > 0) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: uniqueProductIds }, tenantId: user.tenantId, isActive: true },
        select: { id: true, price: true },
      });

      for (const p of products) productsById.set(p.id, p);

      if (products.length !== uniqueProductIds.length) {
        throw new BadRequestException('Some products were not found (or are inactive).');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          title: dto.title,
          value: dto.value,
          currency: (dto.currency ?? 'USD').toUpperCase(),
          expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
          tenantId: user.tenantId,
          pipelineId: dto.pipelineId,
          stageId,
        },
      });

      if (uniqueProductIds.length > 0) {
        await tx.dealItem.createMany({
          data: uniqueProductIds.map((productId) => ({
            tenantId: user.tenantId,
            dealId: deal.id,
            productId,
            quantity: 1,
            unitPrice: productsById.get(productId)?.price ?? null,
          })),
        });
      }

      const created = await tx.deal.findFirst({
        where: { id: deal.id, tenantId: user.tenantId },
        include: {
          stage: true,
          items: { include: { product: true } },
        },
      });
      if (!created) throw new NotFoundException('Deal not found');
      return created;
    });
  }

  async findAll(pipelineId: string | undefined, user: RequestUser) {
    return this.prisma.deal.findMany({
      where: {
        tenantId: user.tenantId,
        ...(pipelineId ? { pipelineId } : {}),
      },
      include: {
        stage: true,
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: RequestUser) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        stage: true,
        items: { include: { product: true } },
      },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  async update(id: string, dto: UpdateDealDto, user: RequestUser) {
    await this.ensureBelongs(id, user);
    return this.prisma.deal.update({
      where: { id },
      data: {
        ...dto,
        currency: dto.currency ? dto.currency.toUpperCase() : undefined,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
      },
    });
  }

  async moveStage(id: string, dto: MoveStageDto, user: RequestUser) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!deal) throw new NotFoundException('Deal not found');

    const stage = await this.prisma.stage.findFirst({
      where: { id: dto.stageId, tenantId: user.tenantId, pipelineId: deal.pipelineId },
    });
    if (!stage) throw new BadRequestException('Stage not found for pipeline');

    if (deal.stageId === dto.stageId) return deal;

    return this.prisma.$transaction(async (tx) => {
      await tx.dealStageHistory.create({
        data: {
          tenantId: user.tenantId,
          dealId: deal.id,
          fromStageId: deal.stageId,
          toStageId: dto.stageId,
        },
      });

      return tx.deal.update({
        where: { id: deal.id },
        data: { stageId: dto.stageId },
      });
    });
  }

  async remove(id: string, user: RequestUser) {
    await this.ensureBelongs(id, user);
    await this.prisma.dealStageHistory.deleteMany({ where: { dealId: id, tenantId: user.tenantId } });
    return this.prisma.deal.delete({ where: { id } });
  }

  private async ensureBelongs(id: string, user: RequestUser) {
    const exists = await this.prisma.deal.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!exists) throw new NotFoundException('Deal not found');
  }
}
