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
  }
}
