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
}
