import { Injectable } from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  async clients(user: RequestUser) {
    const records = await this.prisma.client.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    const csv = stringify(records, { header: true });
    return csv;
  }

  async invoices(user: RequestUser) {
    const records = await this.prisma.invoice.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    const csv = stringify(records, { header: true });
    return csv;
  }

  async backup(user: RequestUser) {
    const tenantWhere = { tenantId: user.tenantId };
    const [
      tenant,
      users,
      clients,
      clientCollaborators,
      tasks,
      invoices,
      pipelines,
      stages,
      deals,
      dealItems,
      dealStageHistory,
      products,
      postSalesCases,
    ] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: user.tenantId } }),
      this.prisma.user.findMany({
        where: tenantWhere,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          tenantId: true,
          firstLoginAt: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.client.findMany({
        where: tenantWhere,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.clientCollaborator.findMany({
        where: tenantWhere,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.task.findMany({
        where: tenantWhere,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: tenantWhere,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.pipeline.findMany({
        where: tenantWhere,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stage.findMany({
        where: tenantWhere,
        orderBy: [{ pipelineId: 'asc' }, { position: 'asc' }],
      }),
      this.prisma.deal.findMany({
        where: tenantWhere,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dealItem.findMany({
        where: tenantWhere,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dealStageHistory.findMany({
        where: tenantWhere,
        orderBy: { movedAt: 'desc' },
      }),
      this.prisma.product.findMany({
        where: tenantWhere,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.postSalesCase.findMany({
        where: tenantWhere,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      tenantId: user.tenantId,
      format: 'o7-pulsecrm-backup-v1',
      tenant,
      users,
      clients,
      clientCollaborators,
      tasks,
      invoices,
      pipelines,
      stages,
      deals,
      dealItems,
      dealStageHistory,
      products,
      postSalesCases,
    };
  }
}
