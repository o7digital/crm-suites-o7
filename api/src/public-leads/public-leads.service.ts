import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PublicLeadPayload = {
  tenantId?: string;
  tenantName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  industry?: string;
  message?: string;
  source?: string;
  language?: string;
  siteCode?: string;
  pipelineId?: string;
  packageTitle?: string;
  packagePrice?: number | string;
  packageTotal?: number | string;
  currency?: string;
};

@Injectable()
export class PublicLeadsService {
  constructor(private prisma: PrismaService) {}

  async createO7Lead(payload: PublicLeadPayload) {
    const requestedTenantId = this.clean(payload.tenantId);
    const owner = requestedTenantId
      ? await this.prisma.user.findFirst({
          where: {
            tenantId: requestedTenantId,
            role: { in: ['OWNER', 'ADMIN'] },
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true, tenantId: true },
        }) ||
        (await this.prisma.user.findFirst({
          where: { tenantId: requestedTenantId },
          orderBy: { createdAt: 'asc' },
          select: { id: true, tenantId: true },
        }))
      : await this.prisma.user.findUnique({
          where: { email: 'olivier.steineur@gmail.com' },
          select: { id: true, tenantId: true },
        });

    if (!owner) {
      throw new NotFoundException('CRM owner not found');
    }

    const firstName = this.clean(payload.firstName);
    const lastName = this.clean(payload.lastName) || 'Lead chat O7';
    const email = this.clean(payload.email);
    const phone = this.clean(payload.phone);
    const source = this.clean(payload.source) || 'Chat IA O7';
    const siteCode = this.clean(payload.siteCode) || 'o7digital';
    const language = this.clean(payload.language) || 'fr';
    const message = this.clean(payload.message);
    const industry = this.clean(payload.industry);
    const tenantName = this.clean(payload.tenantName);
    const packageTitle = this.clean(payload.packageTitle);
    const packagePrice = this.clean(payload.packagePrice);
    const packageTotal = this.clean(payload.packageTotal);
    const currency = this.clean(payload.currency) || 'MXN';
    const dealValue = this.toDecimal(packageTotal || packagePrice);

    const notes = [
      `Source: ${source}`,
      `Site code: ${siteCode}`,
      `Langue: ${language}`,
      tenantName ? `Tenant: ${tenantName}` : null,
      industry ? `Industrie: ${industry}` : null,
      packageTitle ? `Forfait: ${packageTitle}` : null,
      packagePrice ? `Prix affiché: ${packagePrice} ${currency}` : null,
      packageTotal ? `Total estimé: ${packageTotal} ${currency}` : null,
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
              companySector: industry,
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
              companySector: industry,
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
                title: [
                  packageTitle ? `Cotización ${packageTitle}` : 'Lead web',
                  [firstName, lastName].filter(Boolean).join(' '),
                ]
                  .filter(Boolean)
                  .join(' - '),
                value: dealValue,
                currency,
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
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private toDecimal(value: string | undefined) {
    if (!value) return new Prisma.Decimal(0);
    const normalized = value.replace(/[^\d.]/g, '');
    const parsed = Number(normalized);
    return new Prisma.Decimal(Number.isFinite(parsed) ? parsed : 0);
  }
}
