import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ChatGptApiKeyGuard } from './chatgpt-api-key.guard';

function requestContext(request: Record<string, any>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as any;
}

describe('ChatGptApiKeyGuard', () => {
  const originalEnv = { ...process.env };
  const hash = (value: string) =>
    createHash('sha256').update(value).digest('hex');

  let prisma: any;
  let reflector: any;
  let audit: any;

  beforeEach(() => {
    process.env.CHATGPT_O7_TENANT_ID = 'tenant-o7';
    process.env.CHATGPT_API_KEY = 'correct-secret';
    process.env.CHATGPT_INTEGRATION_ENABLED = 'true';
    prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-o7' }) },
      externalApiCredential: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue([]) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('accepts the O7 key and injects only the configured O7 tenant', async () => {
    const request: any = {
      headers: { authorization: 'Bearer correct-secret' },
      query: {},
      body: {},
      originalUrl: '/api/integrations/chatgpt/clients',
    };
    const guard = new ChatGptApiKeyGuard(prisma, reflector, audit);

    await expect(guard.canActivate(requestContext(request))).resolves.toBe(
      true,
    );
    expect(request.chatGptAuth.tenantId).toBe('tenant-o7');
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-o7' },
      select: { id: true },
    });
  });

  it('rejects tenantId supplied in the URL instead of allowing cross-tenant selection', async () => {
    const request = {
      headers: { authorization: 'Bearer correct-secret' },
      query: { tenantId: 'tenant-client' },
      body: {},
      originalUrl: '/api/integrations/chatgpt/clients?tenantId=tenant-client',
    };
    const guard = new ChatGptApiKeyGuard(prisma, reflector, audit);

    await expect(
      guard.canActivate(requestContext(request)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-o7', statusHttp: 400 }),
    );
  });

  it('returns 401 when the bearer token is missing', async () => {
    const guard = new ChatGptApiKeyGuard(prisma, reflector, audit);
    await expect(
      guard.canActivate(
        requestContext({
          headers: {},
          query: {},
          body: {},
          originalUrl: '/summary',
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns 401 for a wrong key', async () => {
    const guard = new ChatGptApiKeyGuard(prisma, reflector, audit);
    await expect(
      guard.canActivate(
        requestContext({
          headers: { authorization: 'Bearer wrong-secret' },
          query: {},
          body: {},
          originalUrl: '/summary',
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses a rotated hashed credential instead of continuing to accept the env key', async () => {
    prisma.externalApiCredential.findUnique.mockResolvedValue({
      keyId: 'o7_rotated',
      apiKeyHash: hash('rotated-secret'),
      enabled: true,
      scopes: ['clients:read'],
    });
    const guard = new ChatGptApiKeyGuard(prisma, reflector, audit);

    await expect(
      guard.canActivate(
        requestContext({
          headers: { authorization: 'Bearer correct-secret' },
          query: {},
          body: {},
          originalUrl: '/clients',
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
