import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { Prisma } from '@prisma/client';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { CreateUserInviteDto } from './dto/create-user-invite.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

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
    let dbUser: { role: string } | null = null;
    try {
      dbUser = await this.prisma.user.findFirst({
        where: { id: user.userId, tenantId: user.tenantId },
        select: { role: true },
      });
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
    if (!dbUser) throw new NotFoundException('User not found');
    if (dbUser.role !== 'OWNER' && dbUser.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
  }

  private async getCustomerSeatLimit(tenantId: string): Promise<number | null> {
    try {
      const activeSubscription = await this.prisma.subscription.findFirst({
        where: { customerTenantId: tenantId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        select: { seats: true },
      });
      if (!activeSubscription) return null;
      return Math.max(1, activeSubscription.seats || 1);
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  private async ensureInviteSeatCapacity(tenantId: string) {
    const seatLimit = await this.getCustomerSeatLimit(tenantId);
    if (seatLimit === null) return;

    try {
      const [memberCount, pendingInvites] = await Promise.all([
        this.prisma.user.count({ where: { tenantId } }),
        this.prisma.userInvite.count({ where: { tenantId, status: 'PENDING' } }),
      ]);
      if (memberCount + pendingInvites >= seatLimit) {
        throw new BadRequestException(
          `User limit reached (${seatLimit}). Increase subscription users before sending another invite.`,
        );
      }
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
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

  async listUserInvites(user: RequestUser) {
    await this.ensureAdmin(user);
    try {
      return await this.prisma.userInvite.findMany({
        where: { tenantId: user.tenantId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          token: true,
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

  async createUserInvite(dto: CreateUserInviteDto, user: RequestUser) {
    await this.ensureAdmin(user);

    const email = dto.email.trim().toLowerCase();
    if (!email) throw new BadRequestException('Email is required');
    const name = dto.name?.trim() || null;
    const role = dto.role || 'MEMBER';

    try {
      const existingMember = await this.prisma.user.findFirst({
        where: { tenantId: user.tenantId, email },
        select: { id: true },
      });
      if (existingMember) {
        throw new BadRequestException('This email is already a workspace member.');
      }

      const existingPending = await this.prisma.userInvite.findFirst({
        where: { tenantId: user.tenantId, email, status: 'PENDING' },
        select: { id: true },
      });

      if (existingPending) {
        return this.prisma.userInvite.update({
          where: { id: existingPending.id },
          data: {
            name,
            role,
            token: randomUUID(),
            invitedByUserId: user.userId,
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            token: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      }

      await this.ensureInviteSeatCapacity(user.tenantId);

      return this.prisma.userInvite.create({
        data: {
          tenantId: user.tenantId,
          email,
          name,
          role,
          token: randomUUID(),
          invitedByUserId: user.userId,
          status: 'PENDING',
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          token: true,
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

  async revokeUserInvite(id: string, user: RequestUser) {
    await this.ensureAdmin(user);
    try {
      const existing = await this.prisma.userInvite.findFirst({
        where: { id, tenantId: user.tenantId, status: 'PENDING' },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Invite not found');

      return this.prisma.userInvite.update({
        where: { id: existing.id },
        data: { status: 'REVOKED' },
        select: { id: true, status: true, updatedAt: true },
      });
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
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
          if (typeof dto.seats === 'number') {
            return Math.min(30, Math.max(1, dto.seats));
          }
          switch (plan) {
            case 'PULSE_BASIC':
              return 1;
            case 'PULSE_STANDARD':
              return 3;
            case 'PULSE_ADVANCED':
              return 5;
            case 'PULSE_ADVANCED_PLUS':
              return 10;
            case 'PULSE_TEAM':
              return 20;
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

  async updateSubscription(id: string, dto: UpdateSubscriptionDto, user: RequestUser) {
    await this.ensureAdmin(user);

    const hasChanges =
      dto.customerName !== undefined ||
      dto.contactFirstName !== undefined ||
      dto.contactLastName !== undefined ||
      dto.contactEmail !== undefined ||
      dto.seats !== undefined;
    if (!hasChanges) throw new BadRequestException('No fields provided');

    const normalize = (value: string | null | undefined) => {
      if (value === null) return null;
      if (value === undefined) return undefined;
      const v = value.trim();
      return v ? v : null;
    };

    const trimmedCustomerName = dto.customerName?.trim();
    if (dto.customerName !== undefined && !trimmedCustomerName) {
      throw new BadRequestException('Customer name is required');
    }

    try {
      const existing = await this.prisma.subscription.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { id: true, customerTenantId: true },
      });
      if (!existing) throw new NotFoundException('Subscription not found');

      return await this.prisma.$transaction(async (tx) => {
        if (trimmedCustomerName) {
          await tx.tenant.updateMany({
            where: { id: existing.customerTenantId },
            data: { name: trimmedCustomerName },
          });
        }

        return tx.subscription.update({
          where: { id: existing.id },
          data: {
            customerName: trimmedCustomerName || undefined,
            contactFirstName: normalize(dto.contactFirstName),
            contactLastName: normalize(dto.contactLastName),
            contactEmail: normalize(dto.contactEmail),
            seats: typeof dto.seats === 'number' ? Math.min(30, Math.max(1, dto.seats)) : undefined,
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
