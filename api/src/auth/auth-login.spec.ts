import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('CRM password login', () => {
  let prisma: any;
  let jwt: any;
  let service: AuthService;
  const user = { id: 'customer', tenantId: 'workspace', email: 'client@example.com', name: 'Client', password: '', firstLoginAt: null };
  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn(), update: jest.fn().mockImplementation(({ data }) => ({ ...user, ...data })) },
      subscription: { findFirst: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Client workspace' }) },
    };
    jwt = { sign: jest.fn().mockReturnValue('local-jwt') };
    service = new AuthService(prisma, jwt);
  });
  it('allows provider fallback for accounts without a CRM password', async () => {
    prisma.user.findFirst.mockResolvedValue(user);
    await expect(service.login({ email: user.email, password: 'Password123' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });
  it('accepts an admin-assigned password and preserves the user and workspace IDs', async () => {
    prisma.user.findFirst.mockResolvedValue({ ...user, password: await bcrypt.hash('Password123', 4) });
    const session = await service.login({ email: 'Client@Example.com', password: 'Password123' });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { email: { equals: 'Client@Example.com', mode: 'insensitive' } } });
    expect(session).toEqual({ token: 'local-jwt', user: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, tenantName: 'Client workspace' } });
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ sub: user.id, tenantId: user.tenantId }));
  });
  it('rejects a wrong CRM password without falling back to the old provider password', async () => {
    prisma.user.findFirst.mockResolvedValue({ ...user, password: await bcrypt.hash('Password123', 4) });
    await expect(service.login({ email: user.email, password: 'OldPassword123' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });
  it.each(['PAUSED', 'CANCELED'])('blocks a %s subscription before creating a session', async (status) => {
    prisma.user.findFirst.mockResolvedValue({ ...user, password: await bcrypt.hash('Password123', 4) });
    prisma.subscription.findFirst.mockResolvedValue({ status });
    await expect(service.login({ email: user.email, password: 'Password123' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });
});
