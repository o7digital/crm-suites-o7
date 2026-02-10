import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { FxService } from '../fx/fx.service';

@Injectable()
export class ForecastService {
  constructor(
    private prisma: PrismaService,
    private fx: FxService,
  ) {}

  private schemaCache: { checkedAt: number; hasOwnerId: boolean } | null = null;

  private async hasDealOwnerId(): Promise<boolean> {
    const now = Date.now();
    if (this.schemaCache && now - this.schemaCache.checkedAt < 60_000) {
      return this.schemaCache.hasOwnerId;
    }
    const cols = await this.prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Deal'
        AND column_name IN ('ownerId')
    `;
    const hasOwnerId = cols.some((c) => c.column_name === 'ownerId');
    this.schemaCache = { checkedAt: now, hasOwnerId };
    return hasOwnerId;
  }

  private async getUserRole(user: RequestUser): Promise<'OWNER' | 'ADMIN' | 'MEMBER'> {
    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { role: true },
    });
    return (dbUser?.role as 'OWNER' | 'ADMIN' | 'MEMBER' | undefined) ?? 'MEMBER';
  }

  async getForecast(pipelineId: string | undefined, user: RequestUser) {
    let pipeline = null as null | { id: string; name: string; isDefault: boolean };

    if (pipelineId) {
      pipeline = await this.prisma.pipeline.findFirst({
        where: { id: pipelineId, tenantId: user.tenantId },
        select: { id: true, name: true, isDefault: true },
      });
    } else {
      pipeline = await this.prisma.pipeline.findFirst({
        where: { tenantId: user.tenantId, isDefault: true },
        select: { id: true, name: true, isDefault: true },
      });
      if (!pipeline) {
        pipeline = await this.prisma.pipeline.findFirst({
          where: { tenantId: user.tenantId },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, isDefault: true },
        });
      }
    }

    if (!pipeline) {
      return {
        pipeline: null,
        total: 0,
        weightedTotal: 0,
        byStage: [],
      };
    }

    const stages = await this.prisma.stage.findMany({
      where: { tenantId: user.tenantId, pipelineId: pipeline.id },
      orderBy: { position: 'asc' },
    });

    const role = await this.getUserRole(user);
    const hasOwnerId = await this.hasDealOwnerId();

    const deals = await this.prisma.deal.findMany({
      where: {
        tenantId: user.tenantId,
        pipelineId: pipeline.id,
        ...(hasOwnerId && role === 'MEMBER' ? { ownerId: user.userId } : {}),
      },
      // Keep this endpoint resilient during migrations (ex: when Deal.clientId doesn't exist yet).
      select: { value: true, currency: true, stageId: true },
    });

    const stageMap = new Map<string, (typeof stages)[number]>(
      stages.map((stage) => [stage.id, stage]),
    );

    let total = 0;
    let weightedTotal = 0;

    const byStage: Array<{
      stageId: string;
      stageName: string;
      status: string;
      probability: number;
      total: number;
      weightedTotal: number;
      count: number;
    }> = stages.map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      status: stage.status,
      probability: stage.probability ?? 0,
      total: 0,
      weightedTotal: 0,
      count: 0,
    }));

    const byStageIndex = new Map<string, (typeof byStage)[number]>(
      byStage.map((row) => [row.stageId, row]),
    );

    let snapshot: Awaited<ReturnType<FxService['getUsdRates']>> | null = null;
    try {
      snapshot = await this.fx.getUsdRates();
    } catch {
      snapshot = null;
    }

    for (const deal of deals) {
      const raw = Number(deal.value);
      if (!Number.isFinite(raw)) continue;
      const cur = (deal.currency || 'USD').toUpperCase();
      const amount = snapshot ? this.fx.toUsd(raw, cur, snapshot) ?? (cur === 'USD' ? raw : 0) : raw;

      total += amount;
      const stage = stageMap.get(deal.stageId);
      const probability = stage?.probability ?? (stage?.status === 'WON' ? 1 : stage?.status === 'LOST' ? 0 : 0);
      weightedTotal += amount * probability;

      const row = byStageIndex.get(deal.stageId);
      if (row) {
        row.total += amount;
        row.weightedTotal += amount * probability;
        row.count += 1;
      }
    }

    return {
      pipeline,
      total,
      weightedTotal,
      byStage,
    };
  }
}
