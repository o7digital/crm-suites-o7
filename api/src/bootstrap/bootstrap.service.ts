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
    // Tenant-level CRM mode (B2B vs B2C) decides which pipeline should be default.
    let crmMode: 'B2B' | 'B2C' = 'B2B';
    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { crmMode: true } });
      if (tenant?.crmMode === 'B2C') crmMode = 'B2C';
    } catch {
      // If the column doesn't exist yet (migrations pending), keep the legacy default.
      crmMode = 'B2B';
    }

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
        { name: 'Contract', position: 6, probability: 0.95, status: 'OPEN' as const },
        { name: 'Won', position: 7, probability: 1.0, status: 'WON' as const },
        { name: 'INVOICE Customer', position: 8, probability: 1.0, status: 'WON' as const },
        { name: 'TRANSFER PAYMENT', position: 9, probability: 1.0, status: 'WON' as const },
        { name: 'Lost', position: 10, probability: 0.0, status: 'LOST' as const },
        { name: 'Transfer Scheduled', position: 11, probability: 1.0, status: 'WON' as const },
        { name: 'Paid', position: 12, probability: 1.0, status: 'WON' as const },
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

    // Ensure B2C pipeline exists (Business-to-Consumer).
    let b2c = find('B2C');
    if (!b2c) {
      const created = await this.prisma.pipeline.create({
        data: {
          tenantId,
          name: 'B2C',
          isDefault: false,
        },
      });
      b2c = { id: created.id, name: created.name, isDefault: created.isDefault };

      const stages = [
        { name: 'Lead', position: 1, probability: 0.1, status: 'OPEN' as const },
        { name: 'Qualified', position: 2, probability: 0.3, status: 'OPEN' as const },
        { name: 'Offer', position: 3, probability: 0.5, status: 'OPEN' as const },
        { name: 'Checkout', position: 4, probability: 0.7, status: 'OPEN' as const },
        { name: 'Won', position: 5, probability: 1.0, status: 'WON' as const },
        { name: 'Lost', position: 6, probability: 0.0, status: 'LOST' as const },
      ];

      await this.prisma.stage.createMany({
        data: stages.map((stage) => ({
          ...stage,
          tenantId,
          pipelineId: created.id,
        })),
      });
    }

    // Keep New Sales stages up-to-date for existing tenants (idempotent).
    if (newSales) {
      await this.ensureNewSalesExtraStages(tenantId, newSales.id);
    }

    // Safety: ensure at least one default pipeline exists.
    const desired = crmMode === 'B2C' ? b2c : newSales;
    if (desired) {
      await this.prisma.pipeline.updateMany({ where: { tenantId }, data: { isDefault: false } });
      await this.prisma.pipeline.update({ where: { id: desired.id }, data: { isDefault: true } });
    } else if (newSales) {
      const defaultCount = await this.prisma.pipeline.count({ where: { tenantId, isDefault: true } });
      if (defaultCount === 0) {
        await this.prisma.pipeline.update({ where: { id: newSales.id }, data: { isDefault: true } });
      }
    }
  }

  private async ensureNewSalesExtraStages(tenantId: string, pipelineId: string) {
    const stages = await this.prisma.stage.findMany({
      where: { tenantId, pipelineId },
      select: { id: true, name: true, position: true, status: true, probability: true },
      orderBy: { position: 'asc' },
    });
    if (stages.length === 0) return;

    const byName = new Map(stages.map((s) => [s.name, s]));

    // Ensure "Contract" exists between "Verbal yes" and "Won".
    const verbalYesPos = byName.get('Verbal yes')?.position;
    const wonPos = byName.get('Won')?.position;
    const existingContract = byName.get('Contract');

    if (typeof verbalYesPos === 'number' && typeof wonPos === 'number') {
      if (!existingContract) {
        // Keep ordering stable by making room before "Won".
        await this.prisma.stage.updateMany({
          where: { tenantId, pipelineId, position: { gte: wonPos } },
          data: { position: { increment: 1 } },
        });
        await this.prisma.stage.create({
          data: {
            tenantId,
            pipelineId,
            name: 'Contract',
            status: 'OPEN',
            probability: 0.95,
            position: wonPos,
          },
        });
      } else {
        const patch: Partial<{ status: 'OPEN' | 'WON' | 'LOST'; probability: number }> = {};
        if (existingContract.status !== 'OPEN') patch.status = 'OPEN';
        if (existingContract.probability !== 0.95) patch.probability = 0.95;
        if (Object.keys(patch).length > 0) {
          await this.prisma.stage.update({ where: { id: existingContract.id }, data: patch });
        }
      }
    }

    // Re-read after potential position shifts to keep calculations accurate.
    const refreshed = await this.prisma.stage.findMany({
      where: { tenantId, pipelineId },
      select: { id: true, name: true, position: true, status: true, probability: true },
      orderBy: { position: 'asc' },
    });
    const refreshedByName = new Map(refreshed.map((s) => [s.name, s]));
    const maxPos = refreshed.reduce((m, s) => Math.max(m, s.position), 0);
    const lostPos = refreshedByName.get('Lost')?.position ?? maxPos;

    // We want these stages after "Lost" and kept in order (Transfer Scheduled -> Paid).
    let nextPos = maxPos + 1;

    const ensureStage = async (opts: {
      name: string;
      status: 'OPEN' | 'WON' | 'LOST';
      probability: number;
      minPosition: number;
    }) => {
      const existing = refreshedByName.get(opts.name);
      if (!existing) {
        const position = Math.max(nextPos, opts.minPosition);
        nextPos = position + 1;
        const created = await this.prisma.stage.create({
          data: {
            tenantId,
            pipelineId,
            name: opts.name,
            status: opts.status,
            probability: opts.probability,
            position,
          },
          select: { id: true, name: true, position: true, status: true, probability: true },
        });
        refreshedByName.set(opts.name, created);
        return created;
      }

      const patch: Partial<{ position: number; status: 'OPEN' | 'WON' | 'LOST'; probability: number }> = {};
      if (existing.position < opts.minPosition) {
        patch.position = Math.max(nextPos, opts.minPosition);
        nextPos = patch.position + 1;
      }
      if (existing.status !== opts.status) patch.status = opts.status;
      if (existing.probability !== opts.probability) patch.probability = opts.probability;

      if (Object.keys(patch).length > 0) {
        const updated = await this.prisma.stage.update({
          where: { id: existing.id },
          data: patch,
          select: { id: true, name: true, position: true, status: true, probability: true },
        });
        refreshedByName.set(opts.name, updated);
        return updated;
      }

      return existing;
    };

    const transfer = await ensureStage({
      name: 'Transfer Scheduled',
      status: 'WON',
      probability: 1.0,
      minPosition: lostPos + 1,
    });

    await ensureStage({
      name: 'Paid',
      status: 'WON',
      probability: 1.0,
      minPosition: transfer.position + 1,
    });
  }
}
