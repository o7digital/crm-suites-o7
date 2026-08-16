import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly supportAdminEmails = (process.env.SUPPORT_ADMIN_EMAILS || 'olivier.steineur@gmail.com')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async register(data: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const now = new Date();
    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.tenantName,
        crmDisplayCurrency: 'MXN',
        users: {
          create: {
            email: data.email,
            name: data.name,
            password: await this.hashPassword(data.password),
            firstLoginAt: now,
            lastLoginAt: now,
          },
        },
      },
      include: { users: true },
    });

    const user = tenant.users[0];
    const token = this.signUser(user.id, user.tenantId, user.email);
    return { token, user: this.exposeUser(user) };
  }

  async login(data: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const now = new Date();
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        firstLoginAt: user.firstLoginAt || now,
        lastLoginAt: now,
      },
    });

    const token = this.signUser(updated.id, updated.tenantId, updated.email);
    return { token, user: this.exposeUser(updated) };
  }

  async impersonateSubscriptionCustomer(
    subscriptionId: string,
    actor: { userId: string; tenantId: string; email: string },
  ) {
    const actorEmail = await this.resolveActorEmail(actor);
    if (!actorEmail || !this.supportAdminEmails.includes(actorEmail)) {
      throw new ForbiddenException('Support access is restricted to authorized super admins');
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId: actor.tenantId, status: 'ACTIVE' },
      select: {
        id: true,
        customerName: true,
        customerTenantId: true,
      },
    });
    if (!subscription) {
      throw new NotFoundException('Active customer subscription not found');
    }

    const supportUser = await this.ensureSupportUser(subscription.customerTenantId, actorEmail);
    const token = this.signUser(supportUser.id, supportUser.tenantId, supportUser.email, {
      supportImpersonation: true,
      impersonatedByUserId: actor.userId,
      impersonatedByEmail: actorEmail,
      subscriptionId: subscription.id,
    });

    return {
      token,
      user: {
        ...this.exposeUser(supportUser),
        tenantName: subscription.customerName,
        impersonatedByEmail: actorEmail,
      },
    };
  }

  private signUser(
    userId: string,
    tenantId: string,
    email: string,
    extraClaims?: Record<string, string | boolean>,
  ) {
    return this.jwtService.sign({ sub: userId, tenantId, email, ...extraClaims });
  }

  private async hashPassword(raw: string) {
    const saltRounds = 10;
    return bcrypt.hash(raw, saltRounds);
  }

  private async ensureSupportUser(tenantId: string, actorEmail: string) {
    const supportEmail = this.supportEmailForTenant(tenantId, actorEmail);
    const existing = await this.prisma.user.findUnique({ where: { email: supportEmail } });
    if (existing) {
      if (existing.role !== 'OWNER') {
        return this.prisma.user.update({
          where: { id: existing.id },
          data: { role: 'OWNER', lastLoginAt: new Date() },
        });
      }
      return this.prisma.user.update({
        where: { id: existing.id },
        data: { lastLoginAt: new Date() },
      });
    }

    return this.prisma.user.create({
      data: {
        tenantId,
        email: supportEmail,
        name: 'Olivier Steineur - Support O7',
        password: await this.hashPassword(this.randomSupportPassword()),
        role: 'OWNER',
        firstLoginAt: new Date(),
        lastLoginAt: new Date(),
      },
    });
  }

  private async resolveActorEmail(actor: { userId: string; tenantId: string; email?: string }) {
    const tokenEmail = actor.email?.trim().toLowerCase();
    if (tokenEmail) return tokenEmail;
    const dbUser = await this.prisma.user.findFirst({
      where: { id: actor.userId, tenantId: actor.tenantId },
      select: { email: true },
    });
    return dbUser?.email.trim().toLowerCase() || '';
  }

  private supportEmailForTenant(tenantId: string, actorEmail: string) {
    const [local, domain] = actorEmail.split('@');
    return `${local}+support-${tenantId.slice(0, 12)}@${domain}`;
  }

  private randomSupportPassword() {
    return `${randomUUID()}-${randomUUID()}`;
  }

  private exposeUser(user: { id: string; email: string; name: string; tenantId: string }) {
    const { id, email, name, tenantId } = user;
    return { id, email, name, tenantId };
  }
}
