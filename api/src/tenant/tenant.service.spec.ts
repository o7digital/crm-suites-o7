import { transformMarketingSecrets } from './marketing-secrets';
import { ForbiddenException } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { PrismaService } from '../prisma/prisma.service';

const user = { userId: 'u1', tenantId: 't1', email: 'member@example.com' };
const secrets = {
  provider: 'MAILCHIMP',
  smtp: { host: 'smtp.example.com', password: 'smtp-secret' },
  mailchimp: { apiKey: 'mailchimp-secret', audienceId: 'list-1' },
  brevo: { apiKey: 'brevo-secret' },
  buffer: { apiKey: 'buffer-secret' },
};

function setup(role = 'ADMIN') {
  const tenant = { id: 't1', name: 'Workspace', marketingSetup: secrets };
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue({ role }) },
    tenant: {
      findFirst: jest.fn().mockResolvedValue(tenant),
      update: jest.fn().mockImplementation(async ({ data }) => ({ ...tenant, ...data })),
    },
  };
  const service = new TenantService(prisma as unknown as PrismaService);
  jest.spyOn(service as any, 'enforceDefaultPipeline').mockResolvedValue(undefined);
  return { service, prisma };
}

describe('tenant settings credentials', () => {
  const previousKey = process.env.MARKETING_ENCRYPTION_KEY;
  beforeEach(() => { process.env.MARKETING_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64'); });
  afterEach(() => { if (previousKey === undefined) delete process.env.MARKETING_ENCRYPTION_KEY; else process.env.MARKETING_ENCRYPTION_KEY = previousKey; });
  it('never exposes stored secrets to administrators and reports configured credentials', async () => {
    const { service, prisma } = setup();
    const result = await service.getSettings(user);
    for (const secret of ['smtp-secret', 'mailchimp-secret', 'brevo-secret', 'buffer-secret']) {
      expect(JSON.stringify(result)).not.toContain(secret);
    }
    expect(result.settings.marketingSetup?.mailchimp).toEqual({ audienceId: 'list-1', apiKeyConfigured: true });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { id: 'u1', tenantId: 't1' }, select: { role: true } });
    expect(secrets.mailchimp.apiKey).toBe('mailchimp-secret');
  });

  it('hides marketing configuration from members and rejects their updates', async () => {
    const { service, prisma } = setup('MEMBER');
    expect((await service.getSettings(user)).settings.marketingSetup).toBeNull();
    await expect(service.updateSettings({}, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('preserves credentials when a redacted form is saved', async () => {
    const { service, prisma } = setup();
    const result = await service.updateSettings({ marketingSetup: {
      provider: 'MAILCHIMP', mailchimp: { apiKey: '', audienceId: 'list-2' },
    } }, user);
    expect(transformMarketingSecrets(prisma.tenant.update.mock.calls[0][0].data.marketingSetup, false).mailchimp).toEqual({ apiKey: 'mailchimp-secret', audienceId: 'list-2' });
    expect(JSON.stringify(result)).not.toContain('mailchimp-secret');
  });

  it('allows replacing credentials and explicitly clearing a provider', async () => {
    const { service, prisma } = setup();
    await service.updateSettings({ marketingSetup: {
      provider: 'MAILCHIMP', mailchimp: { apiKey: 'replacement' }, smtp: null,
    } }, user);
    const saved = transformMarketingSecrets(prisma.tenant.update.mock.calls[0][0].data.marketingSetup, false);
    expect(saved.mailchimp.apiKey).toBe('replacement');
    expect(saved.smtp).toBeUndefined();
  });
});
