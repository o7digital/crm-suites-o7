import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { MoveStageDto } from './dto/move-stage.dto';
import * as fs from 'fs';

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
  hasOwnerId: boolean;
  hasProductTables: boolean;
  hasProposalFilePath: boolean;
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
          AND column_name IN ('clientId', 'ownerId', 'proposalFilePath')
      `,
      this.prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('Product', 'DealItem')
      `,
    ]);

    const hasClientId = dealColumns.some((c) => c.column_name === 'clientId');
    const hasOwnerId = dealColumns.some((c) => c.column_name === 'ownerId');
    const hasProposalFilePath = dealColumns.some((c) => c.column_name === 'proposalFilePath');
    const hasProductTables = tables.some((t) => t.table_name === 'Product') && tables.some((t) => t.table_name === 'DealItem');

    const caps = { hasClientId, hasOwnerId, hasProductTables, hasProposalFilePath };
    this.schemaCache = { checkedAt: now, caps };
    return caps;
  }

  private dealSelect(caps: DealSchemaCaps) {
    const select: Record<string, unknown> = { ...DEAL_BASE_SELECT };
    if (caps.hasClientId) {
      select.clientId = true;
      select.client = true;
    }
    if (caps.hasOwnerId) {
      select.ownerId = true;
    }
    if (caps.hasProposalFilePath) {
      select.proposalFilePath = true;
    }
    if (caps.hasProductTables) {
      select.items = { include: { product: true } };
    }
    return select;
  }

  private async getUserRole(user: RequestUser): Promise<'OWNER' | 'ADMIN' | 'MEMBER'> {
    try {
      const dbUser = await this.prisma.user.findFirst({
        where: { id: user.userId, tenantId: user.tenantId },
        select: { role: true },
      });
      return (dbUser?.role as 'OWNER' | 'ADMIN' | 'MEMBER' | undefined) ?? 'MEMBER';
    } catch (err) {
      // Legacy / drifted schemas might not have the role column yet. Don't hard-fail the whole CRM.
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2021' || err.code === 'P2022') {
          return 'OWNER';
        }
      }
      throw err;
    }
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
          ...(caps.hasOwnerId ? { ownerId: user.userId } : {}),
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

      const created = await tx.deal.findFirst({
        where: { id: deal.id, tenantId: user.tenantId },
        select: this.dealSelect(caps),
      });
      if (!created) throw new NotFoundException('Deal not found');
      return created;
    });
  }

  async findAll(pipelineId: string | undefined, user: RequestUser) {
    const caps = await this.getSchemaCaps();
    const role = await this.getUserRole(user);

    return this.prisma.deal.findMany({
      where: {
        tenantId: user.tenantId,
        ...(pipelineId ? { pipelineId } : {}),
        ...(caps.hasOwnerId && role === 'MEMBER' ? { ownerId: user.userId } : {}),
      },
      select: this.dealSelect(caps),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: RequestUser) {
    const caps = await this.getSchemaCaps();
    const role = await this.getUserRole(user);
    const deal = await this.prisma.deal.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        ...(caps.hasOwnerId && role === 'MEMBER' ? { ownerId: user.userId } : {}),
      },
      select: this.dealSelect(caps),
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  async update(id: string, dto: UpdateDealDto, user: RequestUser) {
    const caps = await this.getSchemaCaps();
    await this.ensureBelongs(id, user, caps);

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

    return this.prisma.deal.update({
      where: { id },
      data,
      select: this.dealSelect(caps),
    });
  }

  async uploadProposal(id: string, file: Express.Multer.File, user: RequestUser) {
    if (!file) throw new BadRequestException('File is required');

    const isPdf =
      (file.mimetype || '').toLowerCase() === 'application/pdf' ||
      (file.originalname || '').toLowerCase().endsWith('.pdf');
    if (!isPdf) throw new BadRequestException('Only PDF files are allowed');

    const caps = await this.getSchemaCaps();
    if (!caps.hasProposalFilePath) {
      throw new BadRequestException(
        'CRM schema upgrade pending (missing Deal.proposalFilePath). Please retry in a minute.',
      );
    }

    await this.ensureBelongs(id, user, caps);

    const existing = await this.prisma.deal.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { proposalFilePath: true },
    });
    const oldPath = existing?.proposalFilePath || null;

    const updated = await this.prisma.deal.update({
      where: { id },
      data: { proposalFilePath: file.path },
      select: this.dealSelect(caps),
    });

    if (oldPath && oldPath !== file.path) {
      try {
        fs.unlinkSync(oldPath);
      } catch {
        // ignore missing permissions / already deleted
      }
    }

    return updated;
  }

  async getProposalFilePath(id: string, user: RequestUser): Promise<string> {
    const caps = await this.getSchemaCaps();
    if (!caps.hasProposalFilePath) {
      throw new BadRequestException(
        'CRM schema upgrade pending (missing Deal.proposalFilePath). Please retry in a minute.',
      );
    }

    await this.ensureBelongs(id, user, caps);

    const deal = await this.prisma.deal.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { proposalFilePath: true },
    });
    const filePath = deal?.proposalFilePath || null;
    if (!filePath) throw new NotFoundException('Proposal not found');
    return filePath;
  }

  async moveStage(id: string, dto: MoveStageDto, user: RequestUser) {
    const caps = await this.getSchemaCaps();
    const role = await this.getUserRole(user);
    const deal = await this.prisma.deal.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        ...(caps.hasOwnerId && role === 'MEMBER' ? { ownerId: user.userId } : {}),
      },
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
    const caps = await this.getSchemaCaps();
    await this.ensureBelongs(id, user, caps);
    await this.prisma.dealStageHistory.deleteMany({ where: { dealId: id, tenantId: user.tenantId } });
    return this.prisma.deal.delete({ where: { id }, select: { id: true } });
  }

  private async ensureBelongs(id: string, user: RequestUser, caps: DealSchemaCaps) {
    const role = await this.getUserRole(user);
    const exists = await this.prisma.deal.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        ...(caps.hasOwnerId && role === 'MEMBER' ? { ownerId: user.userId } : {}),
      },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Deal not found');
  }
}
