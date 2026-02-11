import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { RequestUser } from '../common/user.decorator';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTaskDto, user: RequestUser) {
    await this.ensureClient(dto.clientId, user);
    return this.prisma.task.create({
      data: {
        title: dto.title,
        status: dto.status,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        timeSpentHours: dto.timeSpentHours,
        amount: dto.amount,
        currency: (dto.currency ?? 'USD').toUpperCase(),
        clientId: dto.clientId,
        tenantId: user.tenantId,
      },
    });
  }

  async findAll(user: RequestUser, clientId?: string) {
    return this.prisma.task.findMany({
      where: { tenantId: user.tenantId, ...(clientId ? { clientId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { client: true },
    });
  }

  async update(id: string, dto: UpdateTaskDto, user: RequestUser) {
    await this.ensureTask(id, user);
    if (dto.clientId) {
      await this.ensureClient(dto.clientId, user);
    }
    return this.prisma.task.update({
      where: { id },
      data: {
        ...dto,
        currency: dto.currency ? dto.currency.toUpperCase() : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });
  }

  async remove(id: string, user: RequestUser) {
    await this.ensureTask(id, user);
    return this.prisma.task.delete({ where: { id } });
  }

  private async ensureClient(clientId: string, user: RequestUser) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId: user.tenantId },
    });
    if (!client) throw new NotFoundException('Client not found for this tenant');
  }

  private async ensureTask(id: string, user: RequestUser) {
    const task = await this.prisma.task.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!task) throw new NotFoundException('Task not found');
  }
}
