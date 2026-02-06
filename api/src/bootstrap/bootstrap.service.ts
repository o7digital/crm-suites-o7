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
        tenantId: user.tenantId,
      },
    });

    await this.ensureDefaultPipeline(user.tenantId);
  }

  private async ensureDefaultPipeline(tenantId: string) {
    const existing = await this.prisma.pipeline.findFirst({
      where: { tenantId },
    });
    if (existing) return;

    const pipeline = await this.prisma.pipeline.create({
      data: {
        tenantId,
        name: 'Sales',
        isDefault: true,
      },
    });

    const stages = [
      { name: 'Lead', position: 1, probability: 0.1, status: 'OPEN' as const },
      { name: 'Qualified', position: 2, probability: 0.3, status: 'OPEN' as const },
      { name: 'Proposal', position: 3, probability: 0.5, status: 'OPEN' as const },
      { name: 'Negotiation', position: 4, probability: 0.7, status: 'OPEN' as const },
      { name: 'Verbal yes', position: 5, probability: 0.9, status: 'OPEN' as const },
      { name: 'Won', position: 6, probability: 1.0, status: 'WON' as const },
      { name: 'Lost', position: 7, probability: 0.0, status: 'LOST' as const },
    ];

    await this.prisma.stage.createMany({
      data: stages.map((stage) => ({
        ...stage,
        tenantId,
        pipelineId: pipeline.id,
      })),
    });
  }
}
