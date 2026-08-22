import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type OliviaTaskInput = {
  title?: string;
  dueAt?: string | null;
};

export type OliviaOpportunityPayload = {
  sourceMailbox?: string;
  sourceDomain?: string;
  sourceMessageId?: string;
  senderName?: string;
  senderEmail?: string;
  company?: string;
  title?: string;
  estimatedValue?: number | null;
  currency?: string | null;
  probability?: number | null;
  tasks?: OliviaTaskInput[];
  source?: string;
};

function parseJsonMap(value: string | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, mapped]) => [key.trim().toLowerCase(), mapped.trim()]),
    );
  } catch {
    return {};
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

@Injectable()
export class OliviaIntegrationService {
  constructor(private prisma: PrismaService) {}

  async createOpportunity(payload: OliviaOpportunityPayload) {
    const sourceMailbox = this.clean(payload.sourceMailbox)?.toLowerCase();
    const sourceMessageId = this.clean(payload.sourceMessageId);
    if (!sourceMailbox) {
      throw new BadRequestException('sourceMailbox is required');
    }
    if (!sourceMessageId) {
      throw new BadRequestException('sourceMessageId is required');
    }

    const tenantId = await this.resolveTenantId(payload, sourceMailbox);

    const existing = await this.prisma.oliviaIntegrationEvent.findUnique({
      where: {
        sourceMailbox_sourceMessageId: { sourceMailbox, sourceMessageId },
      },
    });
    if (existing) {
      return this.toResult(existing, true);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true, crmDisplayCurrency: true },
        });
        if (!tenant) {
          throw new NotFoundException(
            'Tenant not found for Olivia integration payload',
          );
        }

        const senderName = this.clean(payload.senderName);
        const senderEmail = this.clean(payload.senderEmail)?.toLowerCase();
        const company = this.clean(payload.company);

        const existingClient = senderEmail
          ? await tx.client.findFirst({
              where: { tenantId, email: senderEmail },
              select: { id: true },
            })
          : null;

        const client = existingClient
          ? await tx.client.update({
              where: { id: existingClient.id },
              data: {
                name: senderName || undefined,
                company: company || undefined,
              },
            })
          : await tx.client.create({
              data: {
                name: senderName || senderEmail || 'Olivia One lead',
                email: senderEmail,
                company,
                clientStatus: 'PROSPECT',
                tenantId,
              },
            });

        const pipeline =
          (await tx.pipeline.findFirst({
            where: { tenantId, name: 'New Sales' },
            select: { id: true },
          })) ||
          (await tx.pipeline.findFirst({
            where: { tenantId, isDefault: true },
            select: { id: true },
          }));
        if (!pipeline) {
          throw new NotFoundException('No pipeline available for tenant');
        }

        const stage =
          (await tx.stage.findFirst({
            where: { tenantId, pipelineId: pipeline.id, status: 'OPEN' },
            orderBy: { position: 'asc' },
            select: { id: true },
          })) ||
          (await tx.stage.findFirst({
            where: { tenantId, pipelineId: pipeline.id },
            orderBy: { position: 'asc' },
            select: { id: true },
          }));
        if (!stage) {
          throw new NotFoundException('No stage available for pipeline');
        }

        const title =
          this.clean(payload.title) ||
          `Olivia One opportunity - ${senderName || senderEmail || 'unknown sender'}`;
        const estimatedValue =
          typeof payload.estimatedValue === 'number' &&
          Number.isFinite(payload.estimatedValue)
            ? payload.estimatedValue
            : 0;
        const currency =
          this.clean(payload.currency) || tenant.crmDisplayCurrency || 'USD';
        const probability =
          typeof payload.probability === 'number' &&
          Number.isFinite(payload.probability)
            ? Math.max(0, Math.min(1, payload.probability)) * 100
            : undefined;

        const deal = await tx.deal.create({
          data: {
            title,
            value: new Prisma.Decimal(estimatedValue),
            currency,
            probability,
            tenantId,
            pipelineId: pipeline.id,
            stageId: stage.id,
            clientId: client.id,
          },
        });

        const taskIds: string[] = [];
        for (const taskInput of payload.tasks ?? []) {
          const taskTitle = this.clean(taskInput?.title);
          if (!taskTitle) continue;
          const dueDate = taskInput?.dueAt ? new Date(taskInput.dueAt) : null;
          const task = await tx.task.create({
            data: {
              title: taskTitle,
              dueDate:
                dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : undefined,
              tenantId,
              clientId: client.id,
            },
            select: { id: true },
          });
          taskIds.push(task.id);
        }

        // Idempotency guard: the unique (sourceMailbox, sourceMessageId) index
        // rejects a concurrent duplicate, rolling back this whole transaction.
        const event = await tx.oliviaIntegrationEvent.create({
          data: {
            tenantId,
            sourceMailbox,
            sourceMessageId,
            clientId: client.id,
            dealId: deal.id,
            taskIds,
          },
        });

        return this.toResult(event, false);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.oliviaIntegrationEvent.findUnique({
          where: {
            sourceMailbox_sourceMessageId: { sourceMailbox, sourceMessageId },
          },
        });
        if (raced) return this.toResult(raced, true);
      }
      throw error;
    }
  }

  private toResult(
    event: {
      clientId: string;
      dealId: string | null;
      taskIds: Prisma.JsonValue;
    },
    duplicate: boolean,
  ) {
    return {
      clientId: event.clientId,
      dealId: event.dealId,
      taskIds: Array.isArray(event.taskIds) ? event.taskIds : [],
      duplicate,
    };
  }

  private async resolveTenantId(
    payload: OliviaOpportunityPayload,
    sourceMailbox: string,
  ): Promise<string> {
    const mailboxMap = parseJsonMap(process.env.OLIVIA_MAILBOX_TENANT_MAP);
    const domainMap = parseJsonMap(process.env.OLIVIA_DOMAIN_TENANT_MAP);
    const domain =
      this.clean(payload.sourceDomain)?.toLowerCase() ||
      sourceMailbox.split('@')[1] ||
      '';

    const tenantId =
      mailboxMap[sourceMailbox] ||
      (domain && domainMap[domain]) ||
      process.env.OLIVIA_DEFAULT_TENANT_ID;

    if (!tenantId) {
      throw new BadRequestException(
        'Unable to resolve tenant for Olivia integration payload',
      );
    }
    return tenantId;
  }

  private clean(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
