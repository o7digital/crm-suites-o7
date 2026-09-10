import { ChatGptIntegrationService } from './chatgpt-integration.service';

describe('ChatGptIntegrationService tenant scoping', () => {
  it('scopes every summary CRM query to the tenant injected by the guard', async () => {
    const prisma: any = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ name: 'O7', crmDisplayCurrency: 'MXN' }),
      },
      client: { count: jest.fn().mockResolvedValue(0) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      deal: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ChatGptIntegrationService(prisma);

    await service.summary('tenant-o7');

    for (const call of prisma.client.count.mock.calls) {
      expect(call[0].where).toEqual(
        expect.objectContaining({ tenantId: 'tenant-o7' }),
      );
    }
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-o7' }),
      }),
    );
    expect(prisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-o7' }),
      }),
    );
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-o7' }),
      }),
    );
  });

  it('scopes both pipeline and deal queries to O7', async () => {
    const prisma: any = {
      pipeline: { findMany: jest.fn().mockResolvedValue([]) },
      deal: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await new ChatGptIntegrationService(prisma).pipeline('tenant-o7');
    expect(prisma.pipeline.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-o7',
    });
    expect(prisma.deal.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-o7',
    });
  });
});
