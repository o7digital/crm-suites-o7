import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminService } from './admin.service';

const actor = { userId: 'admin', tenantId: 'workspace', email: 'admin@example.com' };
describe('Admin password management', () => {
  let prisma: any;
  let service: AdminService;
  beforeEach(() => {
    prisma = { user: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({ id: 'target' }) }, subscription: { findFirst: jest.fn() } };
    service = new AdminService(prisma);
  });
  it('hashes the password and returns no password data', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ role: 'ADMIN' }).mockResolvedValueOnce({ id: 'target' });
    expect(await service.setUserPassword('target', 'TestPassword123', actor)).toEqual({ success: true });
    expect(prisma.user.findFirst).toHaveBeenLastCalledWith({ where: { id: 'target', tenantId: 'workspace' }, select: { id: true } });
    const hash = prisma.user.update.mock.calls[0][0].data.password;
    expect(hash).not.toBe('TestPassword123');
    expect(await bcrypt.compare('TestPassword123', hash)).toBe(true);
  });
  it('fails clearly when Supabase admin credentials are missing', async () => {
    const issuer = process.env.SUPABASE_JWT_ISSUER;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_JWT_ISSUER = 'https://example.supabase.co/auth/v1';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    prisma.user.findFirst.mockResolvedValueOnce({ role: 'ADMIN' }).mockResolvedValueOnce({ id: 'target' });
    try {
      await expect(service.setUserPassword('target', 'TestPassword123', actor)).rejects.toThrow('SUPABASE_SERVICE_ROLE_KEY');
      expect(prisma.user.update).not.toHaveBeenCalled();
    } finally {
      if (issuer === undefined) delete process.env.SUPABASE_JWT_ISSUER; else process.env.SUPABASE_JWT_ISSUER = issuer;
      if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    }
  });

  it.each([true, false])('updates Supabase before saving the local hash (success=%s)', async (ok) => {
    const issuer = process.env.SUPABASE_JWT_ISSUER;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_JWT_ISSUER = 'https://example.supabase.co/auth/v1';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-admin-key';
    const request = jest.spyOn(global, 'fetch').mockResolvedValue({ ok } as Response);
    prisma.user.findFirst.mockResolvedValueOnce({ role: 'ADMIN' }).mockResolvedValueOnce({ id: 'target' });
    try {
      if (ok) await expect(service.setUserPassword('target', 'TestPassword123', actor)).resolves.toEqual({ success: true });
      else await expect(service.setUserPassword('target', 'TestPassword123', actor)).rejects.toBeInstanceOf(BadRequestException);
      expect(request).toHaveBeenCalledWith('https://example.supabase.co/auth/v1/admin/users/target', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ password: 'TestPassword123' }) }));
      expect(prisma.user.update).toHaveBeenCalledTimes(ok ? 1 : 0);
    } finally {
      request.mockRestore();
      if (issuer === undefined) delete process.env.SUPABASE_JWT_ISSUER; else process.env.SUPABASE_JWT_ISSUER = issuer;
      if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    }
  });

  it('rejects members before looking up the target', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: 'MEMBER' });
    await expect(service.setUserPassword('target', 'TestPassword123', actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('rejects a target outside the workspace', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ role: 'ADMIN' }).mockResolvedValueOnce(null);
    await expect(service.setUserPassword('target', 'TestPassword123', actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it.each(['short', 'é'.repeat(37)])('rejects an invalid password', async (password) => {
    prisma.user.findFirst.mockResolvedValueOnce({ role: 'ADMIN' }).mockResolvedValueOnce({ id: 'target' });
    await expect(service.setUserPassword('target', password, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('restricts customer changes to subscriptions owned by the manager', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ role: 'ADMIN' }).mockResolvedValueOnce({ id: 'target' });
    prisma.subscription.findFirst.mockResolvedValueOnce({ id: 'owned' }).mockResolvedValueOnce(null).mockResolvedValueOnce({ customerTenantId: 'customer' });
    await service.setSubscriptionUserPassword('owned', 'target', 'TestPassword123', actor);
    expect(prisma.subscription.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'owned', tenantId: 'workspace' } }));
    expect(prisma.user.findFirst).toHaveBeenLastCalledWith({ where: { id: 'target', tenantId: 'customer' }, select: { id: true } });
  });
  it('rejects a subscription belonging to another manager', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: 'ADMIN' });
    prisma.subscription.findFirst.mockResolvedValueOnce({ id: 'owned' }).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(service.setSubscriptionUserPassword('foreign', 'target', 'TestPassword123', actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
