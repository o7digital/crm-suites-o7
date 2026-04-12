import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProjectTaskPriority,
  ProjectTaskStatus,
} from '@prisma/client';
import type { RequestUser } from '../common/user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { CreateProjectTaskDto } from './dto/create-project-task.dto';
import { UpdateProjectTaskDto } from './dto/update-project-task.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';

const DEFAULT_SECTION_NAMES = [
  'To Do',
  'In Progress',
  'Waiting Client',
  'Done',
] as const;

@Injectable()
export class PostSalesService {
  constructor(private prisma: PrismaService) {}

  async listProjects(user: RequestUser, query: ListProjectsQueryDto) {
    return this.prisma.project.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.dealId ? { dealId: query.dealId } : {}),
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            name: true,
            company: true,
          },
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        deal: {
          select: {
            id: true,
            title: true,
            stageId: true,
            pipelineId: true,
          },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProject(dto: CreateProjectDto, user: RequestUser) {
    const [client, owner, deal] = await Promise.all([
      this.prisma.client.findFirst({
        where: { id: dto.clientId, tenantId: user.tenantId },
        select: { id: true },
      }),
      dto.ownerUserId
        ? this.prisma.user.findFirst({
            where: { id: dto.ownerUserId, tenantId: user.tenantId },
            select: { id: true },
          })
        : Promise.resolve(null),
      dto.dealId
        ? this.prisma.deal.findFirst({
            where: { id: dto.dealId, tenantId: user.tenantId },
            select: { id: true, clientId: true },
          })
        : Promise.resolve(null),
    ]);

    if (!client) throw new NotFoundException('Client not found');
    if (dto.ownerUserId && !owner) {
      throw new NotFoundException('Owner user not found');
    }
    if (dto.dealId && !deal) throw new NotFoundException('Deal not found');
    if (deal?.clientId && deal.clientId !== dto.clientId) {
      throw new BadRequestException(
        'Deal client mismatch: use the same client as the deal.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId: user.tenantId,
          clientId: dto.clientId,
          dealId: dto.dealId,
          name: dto.name,
          description: dto.description,
          status: dto.status,
          priority: dto.priority,
          healthStatus: dto.healthStatus,
          ownerUserId: dto.ownerUserId ?? user.userId,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        },
      });

      await tx.projectSection.createMany({
        data: DEFAULT_SECTION_NAMES.map((name, index) => ({
          tenantId: user.tenantId,
          projectId: project.id,
          name,
          position: index,
        })),
      });

      return tx.project.findFirst({
        where: { id: project.id, tenantId: user.tenantId },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              name: true,
              company: true,
            },
          },
          owner: { select: { id: true, name: true, email: true } },
          deal: { select: { id: true, title: true, stageId: true, pipelineId: true } },
          sections: { orderBy: { position: 'asc' } },
          _count: { select: { tasks: true } },
        },
      });
    });
  }

  async findProject(id: string, user: RequestUser) {
    const project = await this.prisma.project.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            name: true,
            company: true,
            email: true,
          },
        },
        deal: {
          select: {
            id: true,
            title: true,
            value: true,
            currency: true,
            stageId: true,
            pipelineId: true,
          },
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        sections: {
          orderBy: { position: 'asc' },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async findProjectTasks(projectId: string, user: RequestUser) {
    await this.ensureProject(projectId, user.tenantId);

    return this.prisma.projectTask.findMany({
      where: { projectId, tenantId: user.tenantId },
      include: {
        section: true,
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        client: {
          select: {
            id: true,
            firstName: true,
            name: true,
            company: true,
          },
        },
        _count: {
          select: {
            comments: true,
            children: true,
          },
        },
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createTask(dto: CreateProjectTaskDto, user: RequestUser) {
    const project = await this.ensureProject(dto.projectId, user.tenantId);
    const section = await this.resolveSectionForCreate(
      user.tenantId,
      dto.projectId,
      dto.sectionId,
    );

    await this.ensureOptionalClient(
      dto.clientId ?? project.clientId,
      user.tenantId,
      'Client not found',
    );
    await this.ensureOptionalUser(dto.assigneeUserId, user.tenantId);
    await this.ensureOptionalParentTask(dto.parentTaskId, dto.projectId, user.tenantId);

    const position =
      dto.position ??
      (await this.getNextTaskPosition(dto.projectId, section?.id ?? null, user.tenantId));

    return this.prisma.projectTask.create({
      data: {
        tenantId: user.tenantId,
        projectId: dto.projectId,
        sectionId: section?.id,
        clientId: dto.clientId ?? project.clientId,
        title: dto.title,
        description: dto.description,
        status: dto.status ?? this.statusFromSectionName(section?.name),
        priority: dto.priority,
        assigneeUserId: dto.assigneeUserId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        estimatedHours: this.decimalOrUndefined(dto.estimatedHours),
        spentHours: this.decimalOrUndefined(dto.spentHours),
        parentTaskId: dto.parentTaskId,
        position,
      },
      include: {
        section: true,
        assignee: { select: { id: true, name: true, email: true } },
        client: {
          select: {
            id: true,
            firstName: true,
            name: true,
            company: true,
          },
        },
      },
    });
  }

  async updateTask(id: string, dto: UpdateProjectTaskDto, user: RequestUser) {
    const existing = await this.prisma.projectTask.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { project: true, section: true },
    });
    if (!existing) throw new NotFoundException('Project task not found');

    const projectId = dto.projectId ?? existing.projectId;
    if (projectId !== existing.projectId) {
      await this.ensureProject(projectId, user.tenantId);
    }

    const section =
      dto.sectionId !== undefined
        ? await this.resolveSectionForCreate(
            user.tenantId,
            projectId,
            dto.sectionId || undefined,
          )
        : existing.section;

    const clientId = dto.clientId !== undefined ? dto.clientId : existing.clientId;
    await this.ensureOptionalClient(clientId ?? undefined, user.tenantId, 'Client not found');
    await this.ensureOptionalUser(dto.assigneeUserId, user.tenantId);
    await this.ensureOptionalParentTask(dto.parentTaskId, projectId, user.tenantId, id);

    const status =
      dto.status ??
      (dto.sectionId !== undefined
        ? this.statusFromSectionName(section?.name)
        : undefined);

    const data: Prisma.ProjectTaskUncheckedUpdateInput = {
      projectId,
      sectionId: section?.id ?? null,
      clientId: clientId ?? null,
      title: dto.title,
      description: dto.description,
      status,
      priority: dto.priority,
      assigneeUserId: dto.assigneeUserId,
      startDate: dto.startDate ? new Date(dto.startDate) : dto.startDate,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : dto.dueDate,
      estimatedHours:
        dto.estimatedHours !== undefined
          ? this.decimalOrUndefined(dto.estimatedHours)
          : undefined,
      spentHours:
        dto.spentHours !== undefined
          ? this.decimalOrUndefined(dto.spentHours)
          : undefined,
      parentTaskId: dto.parentTaskId,
      position: dto.position,
    };

    return this.prisma.projectTask.update({
      where: { id },
      data,
      include: {
        section: true,
        assignee: { select: { id: true, name: true, email: true } },
        client: {
          select: {
            id: true,
            firstName: true,
            name: true,
            company: true,
          },
        },
      },
    });
  }

  async addComment(taskId: string, dto: CreateTaskCommentDto, user: RequestUser) {
    const task = await this.prisma.projectTask.findFirst({
      where: { id: taskId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Project task not found');

    return this.prisma.taskComment.create({
      data: {
        tenantId: user.tenantId,
        taskId,
        authorUserId: user.userId,
        body: dto.body,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  private async ensureProject(projectId: string, tenantId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true, clientId: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async resolveSectionForCreate(
    tenantId: string,
    projectId: string,
    sectionId?: string,
  ) {
    if (sectionId) {
      const section = await this.prisma.projectSection.findFirst({
        where: { id: sectionId, projectId, tenantId },
      });
      if (!section) throw new BadRequestException('Section not found for project');
      return section;
    }

    return this.prisma.projectSection.findFirst({
      where: { projectId, tenantId },
      orderBy: { position: 'asc' },
    });
  }

  private async ensureOptionalClient(
    clientId: string | undefined,
    tenantId: string,
    message: string,
  ) {
    if (!clientId) return;
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { id: true },
    });
    if (!client) throw new NotFoundException(message);
  }

  private async ensureOptionalUser(userId: string | undefined, tenantId: string) {
    if (!userId) return;
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Assignee user not found');
  }

  private async ensureOptionalParentTask(
    parentTaskId: string | undefined,
    projectId: string,
    tenantId: string,
    currentTaskId?: string,
  ) {
    if (!parentTaskId) return;
    if (currentTaskId && parentTaskId === currentTaskId) {
      throw new BadRequestException('A task cannot be its own parent.');
    }
    const parent = await this.prisma.projectTask.findFirst({
      where: { id: parentTaskId, projectId, tenantId },
      select: { id: true },
    });
    if (!parent) {
      throw new BadRequestException('Parent task not found in this project.');
    }
  }

  private async getNextTaskPosition(
    projectId: string,
    sectionId: string | null,
    tenantId: string,
  ) {
    const maxPos = await this.prisma.projectTask.aggregate({
      where: {
        projectId,
        tenantId,
        ...(sectionId ? { sectionId } : { sectionId: null }),
      },
      _max: { position: true },
    });
    return (maxPos._max.position ?? -1) + 1;
  }

  private statusFromSectionName(sectionName?: string | null): ProjectTaskStatus {
    const normalized = (sectionName || '').trim().toLowerCase();
    if (!normalized) return ProjectTaskStatus.TODO;
    if (normalized.includes('waiting')) return ProjectTaskStatus.WAITING_CLIENT;
    if (normalized.includes('progress')) return ProjectTaskStatus.IN_PROGRESS;
    if (normalized === 'done') return ProjectTaskStatus.DONE;
    return ProjectTaskStatus.TODO;
  }

  private decimalOrUndefined(value: number | undefined) {
    if (value === undefined) return undefined;
    return new Prisma.Decimal(value);
  }
}
