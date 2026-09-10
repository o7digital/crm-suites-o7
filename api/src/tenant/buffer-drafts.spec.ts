import { TenantService } from './tenant.service';
const user = { userId: 'admin', tenantId: 'tenant-a', email: 'a@example.test' };
describe('Buffer drafts', () => {
  const make = () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ role: 'ADMIN' }) }, tenant: { findFirst: jest.fn().mockResolvedValue({ marketingSetup: null }) } };
    const service = new TenantService(prisma as any);
    jest.spyOn(service as any, 'ensureAdmin').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'loadBufferWorkspace').mockResolvedValue({ config: { apiKey: 'test-only' }, channels: [{ id: 'fb', service: 'facebook' }, { id: 'ig', service: 'instagram' }] });
    const request = jest.spyOn(service as any, 'bufferRequest').mockResolvedValue({ createPost: { post: { id: 'draft-id', status: 'draft', dueAt: '2099-09-16T15:00:00.000Z' } } });
    return { service, request };
  };
  it('creates only dated drafts with network metadata', async () => {
    const { service, request } = make();
    await service.createBufferPost({ text: 'Draft', channelIds: ['fb', 'ig'], mode: 'custom', dueAt: '2099-09-16T15:00:00.000Z', saveToDraft: true }, user);
    expect(request).toHaveBeenCalledTimes(2);
    for (const call of request.mock.calls) {
      expect(call[1]).toContain('saveToDraft: true');
      expect(call[1]).toContain('2099-09-16T15:00:00.000Z');
    }
    expect(request.mock.calls[0][1]).toContain('facebook: { type: post }');
    expect(request.mock.calls[1][1]).toContain('instagram: { type: post, shouldShareToFeed: true }');
  });
  it('rejects attempts to enable automatic publishing', async () => {
    const { service, request } = make();
    await expect(service.createBufferPost({ text: 'Draft', channelIds: ['fb'], mode: 'queue', saveToDraft: false }, user)).rejects.toThrow('Only Buffer drafts');
    expect(request).not.toHaveBeenCalled();
  });
});
