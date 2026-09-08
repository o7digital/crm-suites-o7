import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';

// Calendar boundaries in the requested IANA timezone, including DST changes.
export function calendarWindow(now: Date, timeZone: string) {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new BadRequestException('Invalid timezone');
  }
  const parts = (date: Date) =>
    Object.fromEntries(
      format.formatToParts(date).map((p) => [p.type, p.value]),
    );
  const p = parts(now);
  const local = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  const utcMidnight = (date: Date) => {
    let guess = date.getTime();
    for (let i = 0; i < 4; i++) {
      const v = parts(new Date(guess));
      const rendered = Date.UTC(
        +v.year,
        +v.month - 1,
        +v.day,
        +v.hour,
        +v.minute,
        +v.second,
      );
      const diff = date.getTime() - rendered;
      guess += diff;
      if (!diff) break;
    }
    return new Date(guess);
  };
  const shifted = (days: number) => new Date(local.getTime() + days * 86400000);
  const weekday = (local.getUTCDay() + 6) % 7;
  return {
    today: utcMidnight(local),
    tomorrow: utcMidnight(shifted(1)),
    weekStart: utcMidnight(shifted(-weekday)),
    weekEnd: utcMidnight(shifted(7 - weekday)),
    staleBefore: utcMidnight(shifted(-14)),
  };
}

@Injectable()
export class CommandCenterService {
  constructor(private prisma: PrismaService) {}
  async get(user: RequestUser, timeZone = 'UTC', now = new Date()) {
    const window = calendarWindow(now, timeZone);
    const member = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { role: true },
    });
    const isAdmin = member?.role === 'OWNER' || member?.role === 'ADMIN';
    const tasks: Prisma.TaskWhereInput = {
      tenantId: user.tenantId,
      status: { not: 'DONE' },
      ...(isAdmin ? {} : { assigneeId: user.userId }),
    };
    const deals: Prisma.DealWhereInput = {
      tenantId: user.tenantId,
      status: 'OPEN',
      ...(isAdmin ? {} : { ownerId: user.userId }),
    };
    const taskGroup = async (extra: Prisma.TaskWhereInput) => {
      const where = { ...tasks, ...extra };
      const [count, items] = await Promise.all([
        this.prisma.task.count({ where }),
        this.prisma.task.findMany({
          where,
          select: {
            id: true,
            title: true,
            dueDate: true,
            priority: true,
            assigneeId: true,
            opportunityId: true,
          },
          orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
          take: 10,
        }),
      ]);
      return { count, items };
    };
    const dealGroup = async (extra: Prisma.DealWhereInput) => {
      const where = { ...deals, ...extra };
      const [count, items] = await Promise.all([
        this.prisma.deal.count({ where }),
        this.prisma.deal.findMany({
          where,
          select: {
            id: true,
            title: true,
            value: true,
            currency: true,
            expectedCloseDate: true,
            lastActivityAt: true,
            nextActionAt: true,
            pipelineId: true,
          },
          orderBy: [{ expectedCloseDate: 'asc' }, { id: 'asc' }],
          take: 10,
        }),
      ]);
      return { count, items };
    };
    const [dueToday, overdue, closingThisWeek, noNextAction, staleDeals] =
      await Promise.all([
        taskGroup({ dueDate: { gte: window.today, lt: window.tomorrow } }),
        taskGroup({ dueDate: { lt: window.today } }),
        dealGroup({
          expectedCloseDate: { gte: window.weekStart, lt: window.weekEnd },
        }),
        dealGroup({ nextActionAt: null }),
        dealGroup({
          OR: [
            { lastActivityAt: { lt: window.staleBefore } },
            { lastActivityAt: null, createdAt: { lt: window.staleBefore } },
          ],
        }),
      ]);
    return {
      timeZone,
      generatedAt: now,
      staleDays: 14,
      scope: isAdmin ? 'workspace' : 'assigned',
      dueToday,
      overdue,
      closingThisWeek,
      noNextAction,
      staleDeals,
    };
  }
}
