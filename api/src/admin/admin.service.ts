import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  private async ensureAdmin(user: RequestUser) {
    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { role: true },
    });
    if (!dbUser) throw new NotFoundException('User not found');
    if (dbUser.role !== 'OWNER' && dbUser.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
  }

  async listUsers(user: RequestUser) {
    await this.ensureAdmin(user);
    return this.prisma.user.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateUserRole(userId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER', user: RequestUser) {
    await this.ensureAdmin(user);

    const target = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: user.tenantId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('User not found');

    // Avoid locking out the tenant owner by accident.
    if (target.role === 'OWNER' && role !== 'OWNER') {
      const owners = await this.prisma.user.count({ where: { tenantId: user.tenantId, role: 'OWNER' } });
      if (owners <= 1) {
        throw new ForbiddenException('Cannot remove the last OWNER');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
    });
  }

  async listSubscriptions(user: RequestUser) {
    await this.ensureAdmin(user);
    return this.prisma.subscription.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        customerName: true,
        customerTenantId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createSubscription(customerName: string, user: RequestUser) {
    await this.ensureAdmin(user);
    const trimmed = customerName.trim();
    if (!trimmed) throw new BadRequestException('Customer name is required');

    const customerTenantId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      // Provision the tenant so it exists before the customer signs up.
      await tx.tenant.upsert({
        where: { id: customerTenantId },
        update: { name: trimmed },
        create: { id: customerTenantId, name: trimmed },
      });

      return tx.subscription.create({
        data: {
          tenantId: user.tenantId,
          customerTenantId,
          customerName: trimmed,
        },
        select: {
          id: true,
          customerName: true,
          customerTenantId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  }
}
