import { IntegrationsService } from './integrations.service';
const user = { userId: 'admin-a', tenantId: 'tenant-a', email: 'a@example.test' };
describe('integration status isolation', () => {
  it('rejects members before reading configuration', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ role: 'MEMBER' }) }, tenant: { findFirst: jest.fn() } };
    await expect(new IntegrationsService(prisma as any).status(user)).rejects.toThrow('Admin');
    expect(prisma.tenant.findFirst).not.toHaveBeenCalled();
  });
  it('reads only the authenticated tenant and never reports a configured key as verified', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ role: 'ADMIN' }) }, tenant: { findFirst: jest.fn().mockResolvedValue({ marketingSetup: { mailchimp: { apiKey: 'secret-must-not-leak', audienceId: 'list-a' }, fromEmail: 'a@example.test' } }) } };
    const result = await new IntegrationsService(prisma as any).status(user);
    expect(prisma.tenant.findFirst).toHaveBeenCalledWith({ where: { id: 'tenant-a' }, select: { marketingSetup: true } });
    expect(JSON.stringify(result)).not.toContain('secret-must-not-leak');
    expect(result.integrations[0].state).toBe('configured_unverified');
    expect(result.integrations.slice(1).every(i => i.state === 'unavailable' && i.capabilities.length === 0)).toBe(true);
  });
});
