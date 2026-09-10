import { ForbiddenException } from '@nestjs/common';
import { ChatGptAdminService } from './chatgpt-admin.service';

describe('ChatGptAdminService phase-one defaults', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('shows customer tenants as disabled and never enables a subscription', async () => {
    process.env.CHATGPT_O7_TENANT_ID = 'tenant-o7';
    process.env.CHATGPT_API_KEY = 'secret';
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      externalApiCredential: { findUnique: jest.fn().mockResolvedValue(null) },
      externalApiAccessLog: { findFirst: jest.fn().mockResolvedValue(null) },
      subscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            customerTenantId: 'tenant-client',
            customerName: 'Client Workspace',
          },
        ]),
      },
    };
    const result: any = await new ChatGptAdminService(prisma).getStatus({
      userId: 'owner-o7',
      tenantId: 'tenant-o7',
      email: 'olivier.steineur@gmail.com',
    });

    expect(result.customerTenants).toEqual([
      {
        tenantId: 'tenant-client',
        name: 'Client Workspace',
        externalAi: 'DISABLED',
      },
    ]);
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-o7' } }),
    );
  });

  it('does not allow a customer tenant admin to rotate a key', async () => {
    process.env.CHATGPT_O7_TENANT_ID = 'tenant-o7';
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
    };
    await expect(
      new ChatGptAdminService(prisma).rotateKey({
        userId: 'client-owner',
        tenantId: 'tenant-client',
        email: 'client@example.com',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
