import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { monthlyOccurrenceDate } from './recurrence';

@Injectable()
export class DealRecurrenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DealRecurrenceService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.runOnce().catch((error: unknown) => this.logError(error));
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => this.logError(error));
    }, 60 * 60 * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private logError(error: unknown) {
    this.logger.error(
      `Unable to generate monthly deals: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  async runOnce(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let created = 0;
    try {
      const roots = await this.prisma.deal.findMany({
        where: {
          recurrenceIndex: 1,
          recurrenceMonths: { gt: 1 },
          recurrenceStartAt: { not: null },
        },
        include: { items: true },
      });
      for (const root of roots) {
        const start = root.recurrenceStartAt;
        const months = root.recurrenceMonths;
        const groupId = root.recurrenceGroupId;
        if (!start || !months || !groupId) continue;
        const generated = root.recurrenceGeneratedThrough ?? 1;
        let dueThrough = generated;
        for (let month = generated + 1; month <= months; month += 1) {
          if (monthlyOccurrenceDate(start, month - 1) > now) break;
          dueThrough = month;
        }
        if (dueThrough === generated) continue;

        try {
          const preferredStage = root.recurrenceStageId
            ? await this.prisma.stage.findFirst({
                where: {
                  id: root.recurrenceStageId,
                  tenantId: root.tenantId,
                  pipelineId: root.pipelineId,
                  status: 'OPEN',
                },
                select: { id: true, probability: true },
              })
            : null;
          const stage = preferredStage ?? await this.prisma.stage.findFirst({
            where: { tenantId: root.tenantId, pipelineId: root.pipelineId, status: 'OPEN' },
            orderBy: { position: 'asc' },
            select: { id: true, probability: true },
          });
          if (!stage) {
            this.logger.warn(`Monthly deal ${root.id} has no open stage in its workflow`);
            continue;
          }

          const added = await this.prisma.$transaction(async (tx) => {
            const claim = await tx.deal.updateMany({
              where: { id: root.id, recurrenceGeneratedThrough: generated },
              data: { recurrenceGeneratedThrough: dueThrough },
            });
            if (claim.count !== 1) return 0;
            for (let month = generated + 1; month <= dueThrough; month += 1) {
              const occurrenceDate = monthlyOccurrenceDate(start, month - 1);
              const deal = await tx.deal.create({
                data: {
                  tenantId: root.tenantId,
                  pipelineId: root.pipelineId,
                  stageId: stage.id,
                  status: 'OPEN',
                  title: root.title,
                  value: root.value,
                  currency: root.currency,
                  clientId: root.clientId,
                  ownerId: root.ownerId,
                  probability: stage.probability,
                  expectedCloseDate: occurrenceDate,
                  nextActionAt: occurrenceDate,
                  lastActivityAt: now,
                  recurrenceGroupId: groupId,
                  recurrenceIndex: month,
                  recurrenceMonths: months,
                  recurrenceStartAt: start,
                },
                select: { id: true },
              });
              if (root.items.length > 0) {
                await tx.dealItem.createMany({
                  data: root.items.map((item) => ({
                    tenantId: root.tenantId,
                    dealId: deal.id,
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                  })),
                });
              }
            }
            return dueThrough - generated;
          });
          created += added;
        } catch (error) {
          this.logError(error);
        }
      }
    } finally {
      this.running = false;
    }
    return created;
  }
}
