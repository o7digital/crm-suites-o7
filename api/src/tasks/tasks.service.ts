import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { RequestUser } from '../common/user.decorator';
import { GoogleCalendarService } from '../admin/google-calendar.service';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private googleCalendarService: GoogleCalendarService,
  ) {}

  async create(dto: CreateTaskDto, user: RequestUser) {
    await this.ensureClient(dto.clientId, user);
    await this.ensureAssignments(dto, user);
    if (dto.postSalesCaseId) {
      await this.ensurePostSalesCase(dto.postSalesCaseId, user, dto.clientId);
    }
    const task = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.task.create({
        data: {
          title: dto.title,
          assigneeId: dto.assigneeId,
          opportunityId: dto.opportunityId,
          priority: dto.priority,
          completedAt: dto.status === 'DONE' ? new Date() : null,
          status: dto.status,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          timeSpentHours: dto.timeSpentHours,
          amount: dto.amount,
          currency: (dto.currency ?? 'USD').toUpperCase(),
          clientId: dto.clientId,
          postSalesCaseId: dto.postSalesCaseId,
          tenantId: user.tenantId,
        },
        include: {
          client: {
            select: {
              firstName: true,
              name: true,
              email: true,
            },
          },
        },
      });
      if (changed.opportunityId) {
        await tx.deal.updateMany({
          where: { id: changed.opportunityId, tenantId: user.tenantId },
          data: { lastActivityAt: new Date() },
        });
      }
      return changed;
    });
    void this.googleCalendarService.syncTaskChange(task);
    return task;
  }

  async findAll(user: RequestUser, clientId?: string) {
    return this.prisma.task.findMany({
      where: { tenantId: user.tenantId, ...(clientId ? { clientId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        client: true,
        postSalesCase: true,
        assignee: { select: { id: true, name: true } },
        opportunity: { select: { id: true, title: true } },
      },
    });
  }

  async update(id: string, dto: UpdateTaskDto, user: RequestUser) {
    const existing = await this.ensureTask(id, user);
    await this.ensureAssignments(dto, user);
    if (dto.clientId) {
      await this.ensureClient(dto.clientId, user);
    }
    if (dto.postSalesCaseId) {
      await this.ensurePostSalesCase(dto.postSalesCaseId, user, dto.clientId);
    }
    const task = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.task.update({
        where: { id },
        data: {
          ...dto,
          completedAt:
            dto.status === undefined
              ? undefined
              : dto.status === 'DONE'
                ? existing.status === 'DONE'
                  ? existing.completedAt
                  : new Date()
                : null,
          currency: dto.currency ? dto.currency.toUpperCase() : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        },
        include: {
          client: {
            select: {
              firstName: true,
              name: true,
              email: true,
            },
          },
          postSalesCase: true,
        },
      });
      if (changed.opportunityId) {
        await tx.deal.updateMany({
          where: { id: changed.opportunityId, tenantId: user.tenantId },
          data: { lastActivityAt: new Date() },
        });
      }
      return changed;
    });
    void this.googleCalendarService.syncTaskChange(task);
    return task;
  }

  async remove(id: string, user: RequestUser) {
    await this.ensureTask(id, user);
    const deleted = await this.prisma.task.delete({ where: { id } });
    void this.googleCalendarService.removeTaskFromCalendars(id, user.tenantId);
    return deleted;
  }

  async assignees(user: RequestUser) {
    return this.prisma.user.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  private async ensureAssignments(dto: UpdateTaskDto, user: RequestUser) {
    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: dto.assigneeId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!assignee)
        throw new NotFoundException('Assignee not found for this tenant');
    }
    if (dto.opportunityId) {
      const member = await this.prisma.user.findFirst({
        where: { id: user.userId, tenantId: user.tenantId },
        select: { role: true },
      });
      const opportunity = await this.prisma.deal.findFirst({
        where: {
          id: dto.opportunityId,
          tenantId: user.tenantId,
          ...(member?.role === 'OWNER' || member?.role === 'ADMIN'
            ? {}
            : { ownerId: user.userId }),
        },
        select: { id: true },
      });
      if (!opportunity)
        throw new NotFoundException('Opportunity not found for this tenant');
    }
  }

  private async ensureClient(clientId: string, user: RequestUser) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId: user.tenantId },
    });
    if (!client)
      throw new NotFoundException('Client not found for this tenant');
  }

  private async ensureTask(id: string, user: RequestUser) {
    const task = await this.prisma.task.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async ensurePostSalesCase(
    postSalesCaseId: string,
    user: RequestUser,
    expectedClientId?: string,
  ) {
    const postSalesCase = await this.prisma.postSalesCase.findFirst({
      where: { id: postSalesCaseId, tenantId: user.tenantId },
      select: { id: true, clientId: true },
    });
    if (!postSalesCase)
      throw new NotFoundException('Post-Sales case not found');
    if (
      expectedClientId &&
      postSalesCase.clientId &&
      postSalesCase.clientId !== expectedClientId
    ) {
      throw new NotFoundException('Post-Sales case client mismatch');
    }
  }
}
