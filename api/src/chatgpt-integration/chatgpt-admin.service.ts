import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import type { RequestUser } from '../common/user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CHATGPT_READ_SCOPES } from './chatgpt-auth.types';

@Injectable()
export class ChatGptAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(user: RequestUser) {
    await this.ensureWorkspaceAdmin(user);
    const configuredTenantId = process.env.CHATGPT_O7_TENANT_ID?.trim() || null;
    const isO7Tenant = Boolean(
      configuredTenantId && configuredTenantId === user.tenantId,
    );

    if (!isO7Tenant) {
      return {
        isO7Tenant: false,
        status: 'INACTIVE',
        externalAi: 'DISABLED',
        mode: 'READ_ONLY',
        scopes: [],
        canRotate: false,
        lastApiAccess: null,
        customerTenants: [],
      };
    }

    const [credential, latestLog, customerSubscriptions] = await Promise.all([
      this.prisma.externalApiCredential.findUnique({
        where: {
          tenantId_provider: { tenantId: user.tenantId, provider: 'CHATGPT' },
        },
        select: {
          keyId: true,
          enabled: true,
          scopes: true,
          lastAccessAt: true,
          rotatedAt: true,
        },
      }),
      this.prisma.externalApiAccessLog.findFirst({
        where: { tenantId: user.tenantId },
        orderBy: { accessedAt: 'desc' },
        select: { accessedAt: true, statusHttp: true },
      }),
      this.prisma.subscription.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: 'desc' },
        select: { customerTenantId: true, customerName: true },
      }),
    ]);

    const envEnabled =
      process.env.CHATGPT_INTEGRATION_ENABLED?.trim().toLowerCase() !== 'false';
    const hasCredential = credential
      ? credential.enabled
      : Boolean(process.env.CHATGPT_API_KEY);
    const active = envEnabled && hasCredential;

    return {
      isO7Tenant: true,
      status: active ? 'ACTIVE' : 'INACTIVE',
      externalAi: active ? 'ENABLED' : 'DISABLED',
      mode: 'READ_ONLY',
      scopes: credential?.scopes || [...CHATGPT_READ_SCOPES],
      canRotate: envEnabled,
      keyId:
        credential?.keyId ||
        (process.env.CHATGPT_API_KEY
          ? `env_${this.hash(process.env.CHATGPT_API_KEY).slice(0, 12)}`
          : null),
      lastApiAccess: credential?.lastAccessAt || latestLog?.accessedAt || null,
      lastStatusHttp: latestLog?.statusHttp || null,
      rotatedAt: credential?.rotatedAt || null,
      customerTenants: customerSubscriptions.map((subscription) => ({
        tenantId: subscription.customerTenantId,
        name: subscription.customerName,
        externalAi: 'DISABLED' as const,
      })),
    };
  }

  async rotateKey(user: RequestUser) {
    await this.ensureConfiguredO7Admin(user);
    if (
      process.env.CHATGPT_INTEGRATION_ENABLED?.trim().toLowerCase() === 'false'
    ) {
      throw new ServiceUnavailableException('ChatGPT integration is disabled');
    }

    const rawKey = `o7_chatgpt_${randomBytes(32).toString('base64url')}`;
    const keyId = `o7_${randomBytes(6).toString('hex')}`;
    const now = new Date();
    await this.prisma.externalApiCredential.upsert({
      where: {
        tenantId_provider: { tenantId: user.tenantId, provider: 'CHATGPT' },
      },
      update: {
        keyId,
        apiKeyHash: this.hash(rawKey),
        enabled: true,
        scopes: [...CHATGPT_READ_SCOPES],
        rotatedAt: now,
      },
      create: {
        id: randomUUID(),
        tenantId: user.tenantId,
        provider: 'CHATGPT',
        keyId,
        apiKeyHash: this.hash(rawKey),
        enabled: true,
        scopes: [...CHATGPT_READ_SCOPES],
        rotatedAt: now,
      },
    });

    return {
      keyId,
      apiKey: rawKey,
      rotatedAt: now,
      warning: 'Copy this key now. It will not be displayed again.',
    };
  }

  private async ensureConfiguredO7Admin(user: RequestUser) {
    await this.ensureWorkspaceAdmin(user);
    const configuredTenantId = process.env.CHATGPT_O7_TENANT_ID?.trim();
    if (!configuredTenantId || configuredTenantId !== user.tenantId) {
      throw new ForbiddenException('O7 integration administration only');
    }
  }

  private async ensureWorkspaceAdmin(user: RequestUser) {
    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { role: true },
    });
    if (!dbUser || (dbUser.role !== 'OWNER' && dbUser.role !== 'ADMIN')) {
      throw new ForbiddenException('Admin access required');
    }
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
