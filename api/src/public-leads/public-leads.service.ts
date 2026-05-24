import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PublicLeadPayload = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  message?: string;
  source?: string;
  language?: string;
  siteCode?: string;
  pipelineId?: string;
};

@Injectable()
export class PublicLeadsService {
  constructor(private prisma: PrismaService) {}

  async createO7Lead(payload: PublicLeadPayload) {
    const ownerEmail = 'olivier.steineur@gmail.com';
    const owner = await this.prisma.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true, tenantId: true },
    });

    if (!owner) {
      throw new NotFoundException('O7 CRM owner not found');
    }

    const firstName = this.clean(payload.firstName);
    const lastName = this.clean(payload.lastName) || 'Lead chat O7';
    const email = this.clean(payload.email);
    const phone = this.clean(payload.phone);
    const source = this.clean(payload.source) || 'Chat IA O7';
    const siteCode = this.clean(payload.siteCode) || 'o7digital';
    const language = this.clean(payload.language) || 'fr';
    const message = this.clean(payload.message);

    const notes = [
      `Source: ${source}`,
      `Site code: ${siteCode}`,
      `Langue: ${language}`,
      message ? `Message:\n${message}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    return this.prisma.$transaction(async (tx) => {
      const existingClient = email
        ? await tx.client.findFirst({
            where: {
              tenantId: owner.tenantId,
              email,
            },
            select: { id: true },
          })
        : null;

      const client = existingClient
        ? await tx.client.update({
            where: { id: existingClient.id },
            data: {
              firstName,
              name: lastName,
              phone,
              notes,
              clientStatus: 'PROSPECT',
              ownerUserId: owner.id,
            },
          })
        : await tx.client.create({
            data: {
              firstName,
              name: lastName,
              email,
              phone,
              notes,
              clientStatus: 'PROSPECT',
              ownerUserId: owner.id,
              tenantId: owner.tenantId,
            },
          });

      const requestedPipelineId =
        this.clean(payload.pipelineId) || process.env.O7_PUBLIC_LEADS_PIPELINE_ID;
      const pipeline = requestedPipelineId
        ? await tx.pipeline.findFirst({
            where: { id: requestedPipelineId, tenantId: owner.tenantId },
            select: { id: true },
          })
        : (await tx.pipeline.findFirst({
            where: { tenantId: owner.tenantId, name: 'New Sales' },
            select: { id: true },
          })) ||
          (await tx.pipeline.findFirst({
            where: { tenantId: owner.tenantId, isDefault: true },
            select: { id: true },
          }));

      const stage = pipeline
        ? await tx.stage.findFirst({
            where: { tenantId: owner.tenantId, pipelineId: pipeline.id },
            orderBy: { position: 'asc' },
            select: { id: true },
          })
        : null;

      const deal =
        pipeline && stage
          ? await tx.deal.create({
              data: {
                title: `Lead chat O7 - ${[firstName, lastName].filter(Boolean).join(' ')}`,
                value: new Prisma.Decimal(0),
                currency: 'EUR',
                tenantId: owner.tenantId,
                pipelineId: pipeline.id,
                stageId: stage.id,
                clientId: client.id,
                ownerId: owner.id,
              },
            })
          : null;

      return { ok: true, clientId: client.id, dealId: deal?.id ?? null };
    });
  }

  private clean(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
