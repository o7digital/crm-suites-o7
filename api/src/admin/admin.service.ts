import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { Prisma } from '@prisma/client';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  private mapSchemaError(err: unknown): ServiceUnavailableException | null {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Common Prisma codes when tables/columns are missing because migrations haven't run yet.
      if (err.code === 'P2021' || err.code === 'P2022') {
        return new ServiceUnavailableException(
          'Database schema upgrade pending. Redeploy the API (or run migrations), then retry.',
        );
      }
    }
    return null;
  }

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
    try {
      return await this.prisma.subscription.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          customerName: true,
          customerTenantId: true,
          contactFirstName: true,
          contactLastName: true,
          contactEmail: true,
          plan: true,
          seats: true,
          trialEndsAt: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  async createSubscription(dto: CreateSubscriptionDto, user: RequestUser) {
    await this.ensureAdmin(user);
    const trimmed = dto.customerName.trim();
    if (!trimmed) throw new BadRequestException('Customer name is required');

    const customerTenantId = randomUUID();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const normalize = (value: string | null | undefined) => {
          if (value === null) return null;
          if (value === undefined) return undefined;
          const v = value.trim();
          return v ? v : null;
        };

        const plan =
          dto.plan === 'TRIAL' ||
          dto.plan === 'PULSE_BASIC' ||
          dto.plan === 'PULSE_STANDARD' ||
          dto.plan === 'PULSE_ADVANCED' ||
          dto.plan === 'PULSE_ADVANCED_PLUS' ||
          dto.plan === 'PULSE_TEAM'
            ? dto.plan
            : 'TRIAL';

        const deriveSeats = () => {
          switch (plan) {
            case 'PULSE_BASIC':
              return 1;
            case 'PULSE_STANDARD':
              return 3;
            case 'PULSE_ADVANCED':
              return 5;
            case 'PULSE_ADVANCED_PLUS':
              return 10;
            case 'PULSE_TEAM': {
              const requested = typeof dto.seats === 'number' ? dto.seats : 20;
              return Math.min(30, Math.max(11, requested));
            }
            case 'TRIAL':
            default:
              return 1;
          }
        };

        const seats = deriveSeats();
        const trialEndsAt = plan === 'TRIAL' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;

        // Provision the tenant so it exists before the customer signs up.
        await tx.tenant.upsert({
          where: { id: customerTenantId },
          update: {
            name: trimmed,
            crmMode: dto.crmMode ?? undefined,
            industry: normalize(dto.industry),
          },
          create: {
            id: customerTenantId,
            name: trimmed,
            crmMode: dto.crmMode ?? undefined,
            industry: normalize(dto.industry),
          },
        });

        return tx.subscription.create({
          data: {
            tenantId: user.tenantId,
            customerTenantId,
            customerName: trimmed,
            contactFirstName: normalize(dto.contactFirstName),
            contactLastName: normalize(dto.contactLastName),
            contactEmail: normalize(dto.contactEmail),
            plan,
            seats,
            trialEndsAt,
          },
          select: {
            id: true,
            customerName: true,
            customerTenantId: true,
            contactFirstName: true,
            contactLastName: true,
            contactEmail: true,
            plan: true,
            seats: true,
            trialEndsAt: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      });
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }
}
