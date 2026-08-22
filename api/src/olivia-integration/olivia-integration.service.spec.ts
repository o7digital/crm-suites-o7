import { BadRequestException } from '@nestjs/common';
import { OliviaIntegrationService } from './olivia-integration.service';
import { PrismaService } from '../prisma/prisma.service';

function buildPrismaStub(tx: Record<string, any>, existingEvent: any = null) {
  return {
    oliviaIntegrationEvent: {
      findUnique: jest.fn().mockResolvedValue(existingEvent),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => callback(tx)),
  } as unknown as PrismaService;
}

function buildTx(overrides: Record<string, any> = {}) {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1', crmDisplayCurrency: 'MXN' }),
    },
    client: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'client-1' }),
      update: jest.fn().mockResolvedValue({ id: 'client-1' }),
    },
    pipeline: {
      findFirst: jest.fn().mockResolvedValue({ id: 'pipeline-1' }),
    },
    stage: {
      findFirst: jest.fn().mockResolvedValue({ id: 'stage-1' }),
    },
    deal: {
      create: jest.fn().mockResolvedValue({ id: 'deal-1' }),
    },
    task: {
      create: jest.fn().mockResolvedValue({ id: 'task-1' }),
    },
    oliviaIntegrationEvent: {
      create: jest.fn().mockResolvedValue({
        clientId: 'client-1',
        dealId: 'deal-1',
        taskIds: ['task-1'],
      }),
    },
    ...overrides,
  };
}

describe('OliviaIntegrationService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects payloads missing sourceMailbox or sourceMessageId', async () => {
    const prisma = buildPrismaStub(buildTx());
    const service = new OliviaIntegrationService(prisma);

    await expect(
      service.createOpportunity({ sourceMessageId: 'msg-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createOpportunity({ sourceMailbox: 'sales@brand.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves tenant isolation from the mailbox map, not from client input', async () => {
    process.env.OLIVIA_MAILBOX_TENANT_MAP = JSON.stringify({
      'sales@brand-a.com': 'tenant-a',
      'sales@brand-b.com': 'tenant-b',
    });
    const tx = buildTx({
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-a', crmDisplayCurrency: 'USD' }) },
    });
    const prisma = buildPrismaStub(tx);
    const service = new OliviaIntegrationService(prisma);

    await service.createOpportunity({
      sourceMailbox: 'sales@brand-a.com',
      sourceMessageId: 'msg-1',
      senderEmail: 'lead@example.com',
    });

    expect(tx.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tenant-a' } }),
    );
    expect(tx.client.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-a' }) }),
    );
  });

  it('falls back to the domain map, then the default tenant, and rejects when unresolved', async () => {
    const tx = buildTx();
    const prisma = buildPrismaStub(tx);
    const service = new OliviaIntegrationService(prisma);

    process.env.OLIVIA_DOMAIN_TENANT_MAP = JSON.stringify({ 'brand.com': 'tenant-domain' });
    await service.createOpportunity({
      sourceMailbox: 'ops@brand.com',
      sourceMessageId: 'msg-domain',
    });
    expect(tx.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tenant-domain' } }),
    );

    delete process.env.OLIVIA_DOMAIN_TENANT_MAP;
    process.env.OLIVIA_DEFAULT_TENANT_ID = 'tenant-default';
    await service.createOpportunity({
      sourceMailbox: 'unmapped@example.com',
      sourceMessageId: 'msg-default',
    });
    expect(tx.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tenant-default' } }),
    );

    delete process.env.OLIVIA_DEFAULT_TENANT_ID;
    await expect(
      service.createOpportunity({ sourceMailbox: 'unmapped@example.com', sourceMessageId: 'msg-none' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a new PROSPECT client when none exists, and updates an existing one otherwise', async () => {
    process.env.OLIVIA_DEFAULT_TENANT_ID = 'tenant-1';
    const createTx = buildTx();
    const prismaCreate = buildPrismaStub(createTx);
    await new OliviaIntegrationService(prismaCreate).createOpportunity({
      sourceMailbox: 'sales@brand.com',
      sourceMessageId: 'msg-new-client',
      senderEmail: 'new-lead@example.com',
      senderName: 'New Lead',
    });
    expect(createTx.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'new-lead@example.com', clientStatus: 'PROSPECT' }),
      }),
    );

    const updateTx = buildTx({
      client: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-client' }),
        update: jest.fn().mockResolvedValue({ id: 'existing-client' }),
        create: jest.fn(),
      },
    });
    const prismaUpdate = buildPrismaStub(updateTx);
    await new OliviaIntegrationService(prismaUpdate).createOpportunity({
      sourceMailbox: 'sales@brand.com',
      sourceMessageId: 'msg-existing-client',
      senderEmail: 'known-lead@example.com',
    });
    expect(updateTx.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existing-client' } }),
    );
    expect(updateTx.client.create).not.toHaveBeenCalled();
  });

  it('creates the deal in the New Sales pipeline first open stage, and creates linked tasks', async () => {
    process.env.OLIVIA_DEFAULT_TENANT_ID = 'tenant-1';
    const tx = buildTx();
    const prisma = buildPrismaStub(tx);
    const service = new OliviaIntegrationService(prisma);

    const result = await service.createOpportunity({
      sourceMailbox: 'sales@brand.com',
      sourceMessageId: 'msg-1',
      senderEmail: 'lead@example.com',
      title: 'Expansion opportunity',
      estimatedValue: 5000,
      currency: 'USD',
      probability: 0.6,
      tasks: [{ title: 'Send proposal', dueAt: '2026-09-01T00:00:00.000Z' }, { title: '  ' }],
    });

    expect(tx.pipeline.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1', name: 'New Sales' } }),
    );
    expect(tx.stage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1', pipelineId: 'pipeline-1', status: 'OPEN' } }),
    );
    expect(tx.deal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Expansion opportunity',
          currency: 'USD',
          pipelineId: 'pipeline-1',
          stageId: 'stage-1',
          clientId: 'client-1',
        }),
      }),
    );
    expect(tx.task.create).toHaveBeenCalledTimes(1);
    expect(tx.task.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'Send proposal', clientId: 'client-1' }) }),
    );
    expect(result.dealId).toBe('deal-1');
    expect(result.clientId).toBe('client-1');
    expect(result.taskIds).toEqual(['task-1']);
    expect(result.duplicate).toBe(false);
  });

  it('is idempotent: a duplicate sourceMailbox + sourceMessageId returns the original record without creating a new one', async () => {
    process.env.OLIVIA_DEFAULT_TENANT_ID = 'tenant-1';
    const tx = buildTx();
    const prisma = buildPrismaStub(tx, {
      clientId: 'existing-client',
      dealId: 'existing-deal',
      taskIds: ['existing-task'],
    });
    const service = new OliviaIntegrationService(prisma);

    const result = await service.createOpportunity({
      sourceMailbox: 'sales@brand.com',
      sourceMessageId: 'msg-duplicate',
      senderEmail: 'lead@example.com',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.deal.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      clientId: 'existing-client',
      dealId: 'existing-deal',
      taskIds: ['existing-task'],
      duplicate: true,
    });
  });
});
