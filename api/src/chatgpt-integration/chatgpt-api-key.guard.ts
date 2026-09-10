import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CHATGPT_READ_SCOPES,
  type ChatGptRequest,
  type ChatGptScope,
} from './chatgpt-auth.types';
import { CHATGPT_SCOPE_METADATA } from './chatgpt-scope.decorator';
import { ChatGptAuditService } from './chatgpt-audit.service';

@Injectable()
export class ChatGptApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly audit: ChatGptAuditService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<ChatGptRequest>();
    const configuredTenantId = process.env.CHATGPT_O7_TENANT_ID?.trim();
    const integrationEnabled =
      process.env.CHATGPT_INTEGRATION_ENABLED?.trim().toLowerCase() !== 'false';
    const endpoint = this.auditEndpoint(request);

    if (!integrationEnabled || !configuredTenantId) {
      throw new ServiceUnavailableException('ChatGPT integration is disabled');
    }

    const token = this.extractBearerToken(request.headers.authorization);
    const presentedKeyId = token
      ? `unknown_${this.hash(token).slice(0, 12)}`
      : 'missing';
    if (!token) {
      await this.audit.record({
        tenantId: configuredTenantId,
        apiKeyId: presentedKeyId,
        endpoint,
        statusHttp: 401,
      });
      throw new UnauthorizedException('Bearer token required');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: configuredTenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new ServiceUnavailableException(
        'Configured O7 tenant does not exist',
      );
    }

    const credential = await this.prisma.externalApiCredential.findUnique({
      where: {
        tenantId_provider: {
          tenantId: configuredTenantId,
          provider: 'CHATGPT',
        },
      },
      select: {
        keyId: true,
        apiKeyHash: true,
        enabled: true,
        scopes: true,
      },
    });

    const envKey = process.env.CHATGPT_API_KEY || '';
    const expectedHash = credential ? credential.apiKeyHash : this.hash(envKey);
    const valid =
      (credential ? credential.enabled : Boolean(envKey)) &&
      this.safeHashEquals(this.hash(token), expectedHash);
    const apiKeyId =
      credential?.keyId ||
      (envKey ? `env_${this.hash(envKey).slice(0, 12)}` : presentedKeyId);

    if (!valid) {
      await this.audit.record({
        tenantId: configuredTenantId,
        apiKeyId: presentedKeyId,
        endpoint,
        statusHttp: 401,
      });
      throw new UnauthorizedException('Invalid API key');
    }

    if (this.hasExternalTenantSelector(request)) {
      await this.audit.record({
        tenantId: configuredTenantId,
        apiKeyId,
        endpoint,
        statusHttp: 400,
      });
      throw new BadRequestException(
        'tenantId is server-configured and cannot be supplied',
      );
    }

    const allowedScopes = (credential?.scopes || CHATGPT_READ_SCOPES).filter(
      (scope): scope is ChatGptScope =>
        CHATGPT_READ_SCOPES.includes(scope as ChatGptScope),
    );
    const requiredScopes =
      this.reflector.getAllAndOverride<ChatGptScope[]>(CHATGPT_SCOPE_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) || [];
    if (requiredScopes.some((scope) => !allowedScopes.includes(scope))) {
      await this.audit.record({
        tenantId: configuredTenantId,
        apiKeyId,
        endpoint,
        statusHttp: 403,
      });
      return false;
    }

    request.chatGptAuth = {
      tenantId: configuredTenantId,
      apiKeyId,
      scopes: allowedScopes,
    };
    return true;
  }

  private extractBearerToken(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    return match?.[1] || null;
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private safeHashEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private hasExternalTenantSelector(request: ChatGptRequest) {
    const headers = request.headers as Record<string, unknown>;
    const query = (request.query || {}) as Record<string, unknown>;
    const body = (request.body || {}) as Record<string, unknown>;
    return Boolean(
      query.tenantId ||
      query.tenant_id ||
      body.tenantId ||
      body.tenant_id ||
      headers['x-tenant-id'] ||
      headers['tenant-id'],
    );
  }

  private auditEndpoint(request: ChatGptRequest) {
    return (request.originalUrl || request.url || '').split('?')[0];
  }
}
