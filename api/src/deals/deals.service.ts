import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { MoveStageDto } from './dto/move-stage.dto';

const DEAL_BASE_SELECT = {
  id: true,
  title: true,
  value: true,
  currency: true,
  expectedCloseDate: true,
  tenantId: true,
  pipelineId: true,
  stageId: true,
  createdAt: true,
  updatedAt: true,
  stage: true,
} as const;

type DealSchemaCaps = {
  hasClientId: boolean;
  hasProductTables: boolean;
};

@Injectable()
export class DealsService {
  constructor(private prisma: PrismaService) {}

  private schemaCache: { checkedAt: number; caps: DealSchemaCaps } | null = null;

  private async getSchemaCaps(): Promise<DealSchemaCaps> {
    const now = Date.now();
    if (this.schemaCache && now - this.schemaCache.checkedAt < 60_000) {
      return this.schemaCache.caps;
    }

    const [dealColumns, tables] = await Promise.all([
      this.prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Deal'
          AND column_name IN ('clientId')
      `,
      this.prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('Product', 'DealItem')
      `,
    ]);

    const hasClientId = dealColumns.some((c) => c.column_name === 'clientId');
    const hasProductTables = tables.some((t) => t.table_name === 'Product') && tables.some((t) => t.table_name === 'DealItem');

    const caps = { hasClientId, hasProductTables };
    this.schemaCache = { checkedAt: now, caps };
    return caps;
  }

  async create(dto: CreateDealDto, user: RequestUser) {
    const caps = await this.getSchemaCaps();

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

    let clientId: string | undefined;
    if (dto.clientId) {
      if (!caps.hasClientId) {
        throw new BadRequestException('CRM schema upgrade pending (missing Deal.clientId). Please retry in a minute.');
      }
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!client) {
        throw new BadRequestException('Client not found.');
      }
      clientId = client.id;
    }

    if (uniqueProductIds.length > 0) {
      if (!caps.hasProductTables) {
        throw new BadRequestException('CRM schema upgrade pending (missing products tables). Please retry in a minute.');
      }
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
          clientId,
          tenantId: user.tenantId,
          pipelineId: dto.pipelineId,
          stageId,
        },
      });

      if (caps.hasProductTables && uniqueProductIds.length > 0) {
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

      const created = caps.hasClientId
        ? await tx.deal.findFirst({
            where: { id: deal.id, tenantId: user.tenantId },
            include: {
              client: true,
              stage: true,
              ...(caps.hasProductTables ? { items: { include: { product: true } } } : {}),
            },
          })
        : await tx.deal.findFirst({
            where: { id: deal.id, tenantId: user.tenantId },
            select: DEAL_BASE_SELECT,
          });
      if (!created) throw new NotFoundException('Deal not found');
      return created;
    });
  }

  async findAll(pipelineId: string | undefined, user: RequestUser) {
    const caps = await this.getSchemaCaps();
    if (caps.hasClientId) {
      return this.prisma.deal.findMany({
        where: {
          tenantId: user.tenantId,
          ...(pipelineId ? { pipelineId } : {}),
        },
        include: {
          client: true,
          stage: true,
          ...(caps.hasProductTables ? { items: { include: { product: true } } } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.deal.findMany({
      where: {
        tenantId: user.tenantId,
        ...(pipelineId ? { pipelineId } : {}),
      },
      select: DEAL_BASE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: RequestUser) {
    const caps = await this.getSchemaCaps();
    const deal = caps.hasClientId
      ? await this.prisma.deal.findFirst({
          where: { id, tenantId: user.tenantId },
          include: {
            client: true,
            stage: true,
            ...(caps.hasProductTables ? { items: { include: { product: true } } } : {}),
          },
        })
      : await this.prisma.deal.findFirst({
          where: { id, tenantId: user.tenantId },
          select: DEAL_BASE_SELECT,
        });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  async update(id: string, dto: UpdateDealDto, user: RequestUser) {
    await this.ensureBelongs(id, user);
    const caps = await this.getSchemaCaps();

    if (dto.clientId) {
      if (!caps.hasClientId) {
        throw new BadRequestException('CRM schema upgrade pending (missing Deal.clientId). Please retry in a minute.');
      }
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!client) {
        throw new BadRequestException('Client not found.');
      }
    }

    const data: Prisma.DealUpdateInput = {
      title: dto.title,
      value: dto.value,
      currency: dto.currency ? dto.currency.toUpperCase() : undefined,
      expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
      ...(caps.hasClientId ? { clientId: dto.clientId } : {}),
    };

    if (caps.hasClientId) {
      return this.prisma.deal.update({
        where: { id },
        data,
        include: {
          client: true,
          stage: true,
          ...(caps.hasProductTables ? { items: { include: { product: true } } } : {}),
        },
      });
    }

    return this.prisma.deal.update({
      where: { id },
      data,
      select: DEAL_BASE_SELECT,
    });
  }

  async moveStage(id: string, dto: MoveStageDto, user: RequestUser) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, stageId: true, pipelineId: true },
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
        select: { id: true, stageId: true },
      });
    });
  }

  async remove(id: string, user: RequestUser) {
    await this.ensureBelongs(id, user);
    await this.prisma.dealStageHistory.deleteMany({ where: { dealId: id, tenantId: user.tenantId } });
    return this.prisma.deal.delete({ where: { id }, select: { id: true } });
  }

  private async ensureBelongs(id: string, user: RequestUser) {
    const exists = await this.prisma.deal.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Deal not found');
  }
}
