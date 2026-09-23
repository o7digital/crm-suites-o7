import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Deal } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { CloseDealDto, DEAL_LOSS_REASONS } from './dto/close-deal.dto';
import { RankDealDto, UndoCloseDto } from './dto/rank-deal.dto';

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
const include = {
  stage: true,
  client: true,
  history: {
    include: { toStage: true },
    orderBy: { movedAt: 'desc' as const },
  },
};
const snapshot = (deal: Deal) =>
  json({
    stageId: deal.stageId,
    status: deal.status,
    value: deal.value,
    probability: deal.probability,
    closedAt: deal.closedAt,
    closeNote: deal.closeNote,
    lossReason: deal.lossReason,
    lossComment: deal.lossComment,
    followUpAt: deal.followUpAt,
    nextActionAt: deal.nextActionAt,
    boardOrder: deal.boardOrder,
    lastActivityAt: deal.lastActivityAt,
  });

@Injectable()
export class DealActionsService {
  constructor(private prisma: PrismaService) {}

  private async visibility(tx: Prisma.TransactionClient, user: RequestUser) {
    const member = await tx.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { role: true },
    });
    if (!member) throw new NotFoundException('Workspace member not found');
    return {
      tenantId: user.tenantId,
      ...(member.role === 'MEMBER' ? { ownerId: user.userId } : {}),
    };
  }

  private async change(
    tx: Prisma.TransactionClient,
    deal: Deal,
    data: Prisma.DealUncheckedUpdateManyInput,
  ) {
    const result = await tx.deal.updateMany({
      where: {
        id: deal.id,
        tenantId: deal.tenantId,
        updatedAt: deal.updatedAt,
      },
      data,
    });
    if (result.count !== 1)
      throw new ConflictException('Deal changed. Refresh and try again.');
    return tx.deal.findFirstOrThrow({
      where: { id: deal.id, tenantId: deal.tenantId },
      include,
    });
  }

  async history(id: string, user: RequestUser) {
    const where = await this.visibility(this.prisma, user);
    if (
      !(await this.prisma.deal.findFirst({
        where: { id, ...where },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Deal not found');
    const events = await this.prisma.dealActivity.findMany({
      where: { tenantId: user.tenantId, dealId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const actors = await this.prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        id: { in: events.map((event) => event.actorId) },
      },
      select: { id: true, name: true },
    });
    const names = new Map(actors.map((actor) => [actor.id, actor.name]));
    return events.map((event) => ({
      ...event,
      actorName: names.get(event.actorId) || null,
    }));
  }

  async close(id: string, dto: CloseDealDto, user: RequestUser) {
    if (dto.status === 'LOST' && !DEAL_LOSS_REASONS.includes(dto.lossReason!))
      throw new BadRequestException('Loss reason is required');
    return this.prisma.$transaction(async (tx) => {
      const where = await this.visibility(tx, user);
      const deal = await tx.deal.findFirst({ where: { id, ...where } });
      if (!deal) throw new NotFoundException('Deal not found');
      if (dto.operationId) {
        const previous = await tx.dealActivity.findFirst({
          where: {
            id: dto.operationId,
            tenantId: user.tenantId,
            dealId: id,
            actorId: user.userId,
            action: `CLOSE_${dto.status}`,
          },
        });
        if (previous)
          return {
            ...(await tx.deal.findFirstOrThrow({
              where: { id, ...where },
              include,
            })),
            closeEventId: previous.id,
          };
      }
      if (
        deal.status !== 'OPEN' ||
        (dto.expectedUpdatedAt &&
          deal.updatedAt.toISOString() !== dto.expectedUpdatedAt)
      )
        throw new ConflictException('Deal changed. Refresh and try again.');
      const stage = await tx.stage.findFirst({
        where: {
          tenantId: user.tenantId,
          pipelineId: deal.pipelineId,
          status: dto.status,
        },
        orderBy: { position: 'asc' },
      });
      if (!stage)
        throw new BadRequestException(
          `No ${dto.status} stage available in this pipeline`,
        );
      const followUpAt = dto.followUpAt ? new Date(dto.followUpAt) : null;
      if (
        dto.createFollowUp &&
        (!followUpAt || !deal.clientId || followUpAt.getTime() <= Date.now())
      )
        throw new BadRequestException(
          'A future follow-up date and contact are required',
        );
      const updated = await this.change(tx, deal, {
        status: dto.status,
        stageId: stage.id,
        closedAt: dto.closedAt ? new Date(dto.closedAt) : new Date(),
        value: dto.finalValue,
        probability: dto.status === 'WON' ? 1 : 0,
        closeNote: dto.note?.trim() || null,
        lossReason: dto.status === 'LOST' ? dto.lossReason : null,
        lossComment:
          dto.status === 'LOST' ? dto.lossComment?.trim() || null : null,
        followUpAt,
        nextActionAt: followUpAt,
        lastActivityAt: new Date(),
      });
      await tx.dealStageHistory.create({
        data: {
          tenantId: user.tenantId,
          dealId: id,
          fromStageId: deal.stageId,
          toStageId: stage.id,
        },
      });
      let task: { id: string; updatedAt: Date } | null = null;
      let onboarding: { id: string; updatedAt: Date } | null = null;
      if (dto.createFollowUp && followUpAt && deal.clientId) {
        task = await tx.task.create({
          data: {
            tenantId: user.tenantId,
            clientId: deal.clientId,
            opportunityId: id,
            assigneeId: deal.ownerId,
            title: `Follow-up: ${deal.title}`,
            dueDate: followUpAt,
          },
          select: { id: true, updatedAt: true },
        });
      }
      if (
        dto.status === 'WON' &&
        dto.prepareOnboarding &&
        !(await tx.postSalesCase.findFirst({
          where: { dealId: id, tenantId: user.tenantId },
        }))
      ) {
        onboarding = await tx.postSalesCase.create({
          data: {
            tenantId: user.tenantId,
            dealId: id,
            clientId: deal.clientId,
            name: deal.title,
            ownerUserId: deal.ownerId,
          },
          select: { id: true, updatedAt: true },
        });
      }
      const event = await tx.dealActivity.create({
        data: {
          ...(dto.operationId ? { id: dto.operationId } : {}),
          tenantId: user.tenantId,
          dealId: id,
          actorId: user.userId,
          action: `CLOSE_${dto.status}`,
          before: snapshot(deal),
          after: json({
            ...snapshot(updated),
            updatedAt: updated.updatedAt,
            task,
            onboarding,
          }),
        },
      });
      return { ...updated, closeEventId: event.id };
    });
  }

  async undo(id: string, dto: UndoCloseDto, user: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      const where = await this.visibility(tx, user);
      const deal = await tx.deal.findFirst({ where: { id, ...where } });
      const event = await tx.dealActivity.findFirst({
        where: {
          id: dto.eventId,
          tenantId: user.tenantId,
          dealId: id,
          actorId: user.userId,
          action: { in: ['CLOSE_WON', 'CLOSE_LOST'] },
        },
      });
      if (!deal || !event)
        throw new NotFoundException('Closing event not found');
      const after = event.after as {
        updatedAt: string;
        task?: { id: string; updatedAt: string };
        onboarding?: { id: string; updatedAt: string };
      };
      if (
        Date.now() - event.createdAt.getTime() > 120_000 ||
        deal.updatedAt.toISOString() !== after.updatedAt
      )
        throw new ConflictException(
          'Undo expired or deal changed. Refresh the pipeline.',
        );
      const before = event.before as Record<string, any>;
      if (
        !(await tx.stage.findFirst({
          where: {
            id: before.stageId,
            tenantId: user.tenantId,
            pipelineId: deal.pipelineId,
            status: 'OPEN',
          },
        }))
      )
        throw new ConflictException('Original stage is no longer open');
      if (after.task) {
        const removed = await tx.task.deleteMany({
          where: {
            id: after.task.id,
            tenantId: user.tenantId,
            updatedAt: new Date(after.task.updatedAt),
            status: 'PENDING',
          },
        });
        if (removed.count !== 1)
          throw new ConflictException(
            'Follow-up task changed; undo cannot remove it',
          );
      }
      if (after.onboarding) {
        const removed = await tx.postSalesCase.deleteMany({
          where: {
            id: after.onboarding.id,
            tenantId: user.tenantId,
            updatedAt: new Date(after.onboarding.updatedAt),
            tasks: { none: {} },
          },
        });
        if (removed.count !== 1)
          throw new ConflictException(
            'Onboarding changed; undo cannot remove it',
          );
      }
      const data = { ...before, lastActivityAt: new Date() };
      for (const field of ['closedAt', 'followUpAt', 'nextActionAt'])
        if (data[field]) data[field] = new Date(data[field]);
      const updated = await this.change(tx, deal, data);
      await tx.dealStageHistory.create({
        data: {
          tenantId: user.tenantId,
          dealId: id,
          fromStageId: deal.stageId,
          toStageId: before.stageId,
        },
      });
      await tx.dealActivity.create({
        data: {
          tenantId: user.tenantId,
          dealId: id,
          actorId: user.userId,
          action: 'UNDO_CLOSE',
          before: snapshot(deal),
          after: json({ ...snapshot(updated), closingEventId: event.id }),
        },
      });
      return updated;
    });
  }

  async rank(id: string, dto: RankDealDto, user: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize ordering within a stage; no process-local ordering state.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.tenantId + ':' + dto.stageId}))`;
      const where = await this.visibility(tx, user);
      const deal = await tx.deal.findFirst({
        where: { id, ...where, status: 'OPEN' },
      });
      if (!deal) throw new NotFoundException('Open deal not found');
      if (deal.updatedAt.toISOString() !== dto.expectedUpdatedAt)
        throw new ConflictException('Deal changed. Refresh and try again.');
      const stage = await tx.stage.findFirst({
        where: {
          id: dto.stageId,
          tenantId: user.tenantId,
          pipelineId: deal.pipelineId,
          status: 'OPEN',
        },
      });
      if (!stage) throw new NotFoundException('Open stage not found');
      if (
        dto.targetId &&
        !(await tx.deal.findFirst({
          where: {
            id: dto.targetId,
            ...where,
            stageId: stage.id,
            status: 'OPEN',
          },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Target deal not found');
      const rows = await tx.deal.findMany({
        where: {
          tenantId: user.tenantId,
          stageId: stage.id,
          status: 'OPEN',
          id: { not: id },
        },
        orderBy: [{ boardOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
        select: { id: true },
      });
      let index = dto.targetId
        ? rows.findIndex((row) => row.id === dto.targetId)
        : rows.length;
      if (index < 0) throw new ConflictException('Target moved');
      if (dto.targetId && dto.placement === 'after') index++;
      rows.splice(index, 0, { id });
      const updated = await this.change(tx, deal, {
        stageId: stage.id,
        boardOrder: index,
        lastActivityAt: deal.stageId !== stage.id ? new Date() : undefined,
      });
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].id !== id)
          await tx.deal.updateMany({
            where: {
              id: rows[i].id,
              tenantId: user.tenantId,
              stageId: stage.id,
              status: 'OPEN',
              boardOrder: { not: i },
            },
            data: { boardOrder: i },
          });
      }
      if (deal.stageId !== stage.id)
        await tx.dealStageHistory.create({
          data: {
            tenantId: user.tenantId,
            dealId: id,
            fromStageId: deal.stageId,
            toStageId: stage.id,
          },
        });
      await tx.dealActivity.create({
        data: {
          tenantId: user.tenantId,
          dealId: id,
          actorId: user.userId,
          action: 'RANK',
          before: json({ stageId: deal.stageId, boardOrder: deal.boardOrder }),
          after: json({ stageId: stage.id, boardOrder: index }),
        },
      });
      return updated;
    });
  }
}
