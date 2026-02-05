import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { subDays } from 'date-fns';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSnapshot(user: RequestUser) {
    const tenantId = user.tenantId;
    const [clientCount, taskCounts, invoiceAgg, recentInvoices] = await Promise.all([
      this.prisma.client.count({ where: { tenantId } }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.invoice.findMany({
        where: { tenantId, createdAt: { gte: subDays(new Date(), 30) } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const taskByStatus: Record<string, number> = {};
    for (const { status, _count } of taskCounts) {
      taskByStatus[status] = _count;
    }

    return {
      clients: clientCount,
      tasks: taskByStatus,
      invoices: {
        total: invoiceAgg._count,
        amount: invoiceAgg._sum.amount ? Number(invoiceAgg._sum.amount) : 0,
        recent: recentInvoices,
      },
    };
  }
}
