import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';

interface Meta {
  name?: string;
  tenantName?: string;
}

@Injectable()
export class BootstrapService {
  constructor(private prisma: PrismaService) {}

  async ensure(user: RequestUser, meta: Meta = {}) {
    if (!user.tenantId) return;
    await this.prisma.tenant.upsert({
      where: { id: user.tenantId },
      update: { name: meta.tenantName || undefined },
      create: { id: user.tenantId, name: meta.tenantName || 'Workspace' },
    });

    // Assign OWNER to the first user of a tenant. Future users default to MEMBER.
    const existingUser = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { id: true },
    });
    let role: 'OWNER' | 'MEMBER' = 'MEMBER';
    if (!existingUser) {
      const count = await this.prisma.user.count({ where: { tenantId: user.tenantId } });
      if (count === 0) role = 'OWNER';
    }

    await this.prisma.user.upsert({
      where: { id: user.userId },
      update: {
        email: user.email,
        name: meta.name || user.email || 'User',
      },
      create: {
        id: user.userId,
        email: user.email,
        name: meta.name || user.email || 'User',
        password: '',
        role,
        tenantId: user.tenantId,
      },
    });

    // If this tenant has no OWNER (ex: legacy data before roles), promote the current user.
    const ownerCount = await this.prisma.user.count({ where: { tenantId: user.tenantId, role: 'OWNER' } });
    if (ownerCount === 0) {
      await this.prisma.user.update({ where: { id: user.userId }, data: { role: 'OWNER' } });
    }

    await this.ensureDefaultPipeline(user.tenantId);
  }

  private async ensureDefaultPipeline(tenantId: string) {
    const pipelines = await this.prisma.pipeline.findMany({
      where: { tenantId },
      select: { id: true, name: true, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });

    const hasDefault = pipelines.some((p) => p.isDefault);

    const find = (name: string) => pipelines.find((p) => p.name === name);

    // Legacy rename: Sales -> New Sales.
    const legacySales = find('Sales');
    const existingNewSales = find('New Sales');
    if (legacySales && !existingNewSales) {
      await this.prisma.pipeline.update({
        where: { id: legacySales.id },
        data: { name: 'New Sales' },
      });
      pipelines.splice(pipelines.indexOf(legacySales), 1, { ...legacySales, name: 'New Sales' });
    }

    // Ensure New Sales pipeline exists (default when nothing else is default).
    let newSales = find('New Sales');
    if (!newSales) {
      const created = await this.prisma.pipeline.create({
        data: {
          tenantId,
          name: 'New Sales',
          isDefault: !hasDefault,
        },
      });
      newSales = { id: created.id, name: created.name, isDefault: created.isDefault };

      const stages = [
        { name: 'Lead', position: 1, probability: 0.1, status: 'OPEN' as const },
        { name: 'Qualified', position: 2, probability: 0.3, status: 'OPEN' as const },
        { name: 'Proposal', position: 3, probability: 0.5, status: 'OPEN' as const },
        { name: 'Negotiation', position: 4, probability: 0.7, status: 'OPEN' as const },
        { name: 'Verbal yes', position: 5, probability: 0.9, status: 'OPEN' as const },
        { name: 'Won', position: 6, probability: 1.0, status: 'WON' as const },
        { name: 'INVOICE Customer', position: 7, probability: 1.0, status: 'WON' as const },
        { name: 'TRANSFER PAYMENT', position: 8, probability: 1.0, status: 'WON' as const },
        { name: 'Lost', position: 9, probability: 0.0, status: 'LOST' as const },
      ];

      await this.prisma.stage.createMany({
        data: stages.map((stage) => ({
          ...stage,
          tenantId,
          pipelineId: created.id,
        })),
      });
    }

    // Ensure Post Sales pipeline exists.
    let postSales = find('Post Sales');
    if (!postSales) {
      const created = await this.prisma.pipeline.create({
        data: {
          tenantId,
          name: 'Post Sales',
          isDefault: false,
        },
      });
      postSales = { id: created.id, name: created.name, isDefault: created.isDefault };

      const stages = [
        { name: 'INVOICE Customer', position: 1, probability: 1.0, status: 'OPEN' as const },
        { name: 'TRANSFER PAYMENT', position: 2, probability: 1.0, status: 'OPEN' as const },
      ];

      await this.prisma.stage.createMany({
        data: stages.map((stage) => ({
          ...stage,
          tenantId,
          pipelineId: created.id,
        })),
      });
    }

    // Safety: ensure at least one default pipeline exists.
    if (newSales) {
      const defaultCount = await this.prisma.pipeline.count({ where: { tenantId, isDefault: true } });
      if (defaultCount === 0) {
        await this.prisma.pipeline.update({ where: { id: newSales.id }, data: { isDefault: true } });
      }
    }
  }
}
