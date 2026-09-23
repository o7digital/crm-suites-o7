import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { DealActionsService } from '../src/deals/deal-actions.service';
import { TasksService } from '../src/tasks/tasks.service';
import { PipelinesService } from '../src/pipelines/pipelines.service';
import { StagesService } from '../src/stages/stages.service';
import { CommandCenterService } from '../src/dashboard/command-center.service';
import { TaskStatusEnum } from '../src/tasks/dto/create-task.dto';

const url = process.env.PHASE1_TEST_DATABASE_URL;
if (
  !url ||
  !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
  !new URL(url).pathname.includes('phase1_test')
)
  throw new Error('Disposable local PHASE1_TEST_DATABASE_URL required');
const prisma = new PrismaService({ datasources: { db: { url } } });
const actions = new DealActionsService(prisma);
const tasks = new TasksService(prisma, {
  syncTaskChange: jest.fn(),
  removeTaskFromCalendars: jest.fn(),
} as any);
const pipelines = new PipelinesService(prisma);
const stages = new StagesService(prisma);
const command = new CommandCenterService(prisma);

async function fixture() {
  const tenant = await prisma.tenant.create({ data: { name: 'Phase 1 test' } });
  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `${randomUUID()}@example.test`,
      name: 'Owner',
      password: 'unused',
      role: 'OWNER',
    },
  });
  const member = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `${randomUUID()}@example.test`,
      name: 'Member',
      password: 'unused',
      role: 'MEMBER',
    },
  });
  const client = await prisma.client.create({
    data: { tenantId: tenant.id, name: 'Test contact' },
  });
  const pipeline = await prisma.pipeline.create({
    data: { tenantId: tenant.id, name: 'Test pipeline' },
  });
  const open = await prisma.stage.create({
    data: {
      tenantId: tenant.id,
      pipelineId: pipeline.id,
      name: 'Open',
      position: 0,
    },
  });
  const won = await prisma.stage.create({
    data: {
      tenantId: tenant.id,
      pipelineId: pipeline.id,
      name: 'Won',
      position: 1,
      status: 'WON',
      probability: 1,
    },
  });
  const lost = await prisma.stage.create({
    data: {
      tenantId: tenant.id,
      pipelineId: pipeline.id,
      name: 'Lost',
      position: 2,
      status: 'LOST',
    },
  });
  const deal = await prisma.deal.create({
    data: {
      tenantId: tenant.id,
      pipelineId: pipeline.id,
      stageId: open.id,
      ownerId: owner.id,
      clientId: client.id,
      title: 'Opportunity',
      value: 5000,
      probability: 0.6,
      nextActionAt: new Date('2026-10-01'),
    },
  });
  const user = { userId: owner.id, tenantId: tenant.id, email: owner.email };
  return {
    tenant,
    owner,
    member,
    client,
    pipeline,
    open,
    won,
    lost,
    deal,
    user,
  };
}
afterAll(() => prisma.$disconnect());

it('migrates task fields without rewriting legacy data and timestamps completion/reopening', async () => {
  const f = await fixture();
  const task = await tasks.create(
    {
      title: 'Follow-up',
      clientId: f.client.id,
      opportunityId: f.deal.id,
      assigneeId: f.member.id,
      priority: 'HIGH',
    },
    f.user,
  );
  expect(task.priority).toBe('HIGH');
  expect(task.completedAt).toBeNull();
  const done = await tasks.update(
    task.id,
    { status: TaskStatusEnum.DONE },
    f.user,
  );
  expect(done.completedAt).toBeInstanceOf(Date);
  const repeat = await tasks.update(
    task.id,
    { status: TaskStatusEnum.DONE },
    f.user,
  );
  expect(repeat.completedAt).toEqual(done.completedAt);
  expect(
    (await tasks.update(task.id, { status: TaskStatusEnum.PENDING }, f.user))
      .completedAt,
  ).toBeNull();
  expect(
    (await prisma.deal.findUniqueOrThrow({ where: { id: f.deal.id } }))
      .lastActivityAt,
  ).toBeInstanceOf(Date);
});

it('rejects cross-tenant task links and every pipeline/stage mutation by members', async () => {
  const a = await fixture(),
    b = await fixture();
  for (const patch of [
    { assigneeId: b.owner.id },
    { opportunityId: b.deal.id },
    { clientId: b.client.id },
  ]) {
    await expect(
      tasks.create(
        { title: 'Forbidden', clientId: a.client.id, ...patch },
        a.user,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  }
  const member = { ...a.user, userId: a.member.id };
  for (const action of [
    () => pipelines.create({ name: 'Bad' }, member),
    () => pipelines.update(a.pipeline.id, {}, member),
    () => pipelines.remove(a.pipeline.id, member),
    () => stages.create({ name: 'Bad', pipelineId: a.pipeline.id }, member),
    () => stages.update(a.open.id, {}, member),
    () => stages.remove(a.open.id, member),
    () => stages.reorder({ items: [{ id: a.open.id, position: 5 }] }, member),
  ]) {
    await expect(action()).rejects.toBeInstanceOf(ForbiddenException);
  }
  await expect(
    stages.update(b.open.id, { name: 'Bad' }, a.user),
  ).rejects.toBeInstanceOf(NotFoundException);
  await expect(pipelines.remove(b.pipeline.id, a.user)).rejects.toBeInstanceOf(
    NotFoundException,
  );
  const count = await prisma.stage.count({ where: { tenantId: a.tenant.id } });
  await stages.findAll(a.pipeline.id, member);
  expect(await prisma.stage.count({ where: { tenantId: a.tenant.id } })).toBe(
    count,
  );
});

it.each(['WON', 'LOST'] as const)(
  'closes %s atomically, audits actor/reason, supports idempotent retry and full Undo',
  async (status) => {
    const f = await fixture();
    const operationId = randomUUID();
    const dto = {
      status,
      operationId,
      expectedUpdatedAt: f.deal.updatedAt.toISOString(),
      lossReason: 'price' as const,
      lossComment: 'Too expensive',
      finalValue: 4200,
    };
    const closed = await actions.close(f.deal.id, dto, f.user);
    expect(closed.status).toBe(status);
    expect(closed.closedAt).toBeInstanceOf(Date);
    expect(
      await prisma.deal.count({ where: { id: f.deal.id, status: 'OPEN' } }),
    ).toBe(0);
    const retry = await actions.close(f.deal.id, dto, f.user);
    expect(retry.closeEventId).toBe(closed.closeEventId);
    expect(
      await prisma.dealActivity.count({ where: { dealId: f.deal.id } }),
    ).toBe(1);
    const audit = await actions.history(f.deal.id, f.user);
    expect(audit[0].actorId).toBe(f.owner.id);
    if (status === 'LOST')
      expect((audit[0].after as any).lossReason).toBe('price');
    const reopened = await actions.undo(
      f.deal.id,
      { eventId: closed.closeEventId },
      f.user,
    );
    expect(reopened.status).toBe('OPEN');
    expect(reopened.stageId).toBe(f.open.id);
    expect(reopened.closedAt).toBeNull();
    expect(Number(reopened.value)).toBe(5000);
    expect(reopened.probability).toBe(0.6);
    expect(reopened.nextActionAt).toEqual(f.deal.nextActionAt);
    expect(
      await prisma.dealStageHistory.count({ where: { dealId: f.deal.id } }),
    ).toBe(2);
    expect(
      await prisma.dealActivity.count({ where: { dealId: f.deal.id } }),
    ).toBe(2);
  },
);

it('rejects lost without reason, foreign and non-owned closings, and stale Undo', async () => {
  const a = await fixture(),
    b = await fixture();
  await expect(
    actions.close(a.deal.id, { status: 'LOST' }, a.user),
  ).rejects.toBeInstanceOf(BadRequestException);
  await expect(
    actions.close(b.deal.id, { status: 'WON' }, a.user),
  ).rejects.toBeInstanceOf(NotFoundException);
  await expect(
    actions.close(
      a.deal.id,
      { status: 'WON' },
      { ...a.user, userId: a.member.id },
    ),
  ).rejects.toBeInstanceOf(NotFoundException);
  const closed = await actions.close(a.deal.id, { status: 'WON' }, a.user);
  await prisma.deal.update({
    where: { id: a.deal.id },
    data: {
      title: 'Edited afterwards',
      updatedAt: new Date(Date.now() + 1000),
    },
  });
  await expect(
    actions.undo(a.deal.id, { eventId: closed.closeEventId }, a.user),
  ).rejects.toBeInstanceOf(ConflictException);
  expect(
    (await prisma.deal.findUniqueOrThrow({ where: { id: a.deal.id } })).status,
  ).toBe('WON');
});

it('rolls back deal and history if audit persistence fails', async () => {
  const a = await fixture(),
    b = await fixture();
  const operationId = randomUUID();
  await actions.close(b.deal.id, { status: 'WON', operationId }, b.user);
  await expect(
    actions.close(a.deal.id, { status: 'WON', operationId }, a.user),
  ).rejects.toThrow();
  expect(
    (await prisma.deal.findUniqueOrThrow({ where: { id: a.deal.id } })).status,
  ).toBe('OPEN');
  expect(
    await prisma.dealStageHistory.count({ where: { dealId: a.deal.id } }),
  ).toBe(0);
});

it('persists board order, rejects stale moves and foreign/closed targets', async () => {
  const f = await fixture(),
    foreign = await fixture();
  const other = await prisma.deal.create({
    data: {
      tenantId: f.tenant.id,
      pipelineId: f.pipeline.id,
      stageId: f.open.id,
      title: 'Second',
      value: 100,
      ownerId: f.owner.id,
      boardOrder: 1,
    },
  });
  const dto = {
    stageId: f.open.id,
    targetId: other.id,
    placement: 'after' as const,
    expectedUpdatedAt: f.deal.updatedAt.toISOString(),
  };
  await actions.rank(f.deal.id, dto, f.user);
  const rows = await prisma.deal.findMany({
    where: { tenantId: f.tenant.id, status: 'OPEN' },
    orderBy: { boardOrder: 'asc' },
  });
  expect(rows.map((row) => row.id)).toEqual([other.id, f.deal.id]);
  await expect(actions.rank(f.deal.id, dto, f.user)).rejects.toBeInstanceOf(
    ConflictException,
  );
  const updated = rows[1];
  await expect(
    actions.rank(
      f.deal.id,
      {
        ...dto,
        stageId: foreign.open.id,
        expectedUpdatedAt: updated.updatedAt.toISOString(),
      },
      f.user,
    ),
  ).rejects.toBeInstanceOf(NotFoundException);
  await expect(
    actions.rank(
      f.deal.id,
      {
        ...dto,
        stageId: f.won.id,
        expectedUpdatedAt: updated.updatedAt.toISOString(),
      },
      f.user,
    ),
  ).rejects.toBeInstanceOf(NotFoundException);
});

it('computes Command Center counts with timezone boundaries, ownership and closed-deal exclusion', async () => {
  const f = await fixture(),
    foreign = await fixture();
  const now = new Date('2026-09-07T16:00:00Z');
  await prisma.task.createMany({
    data: [
      {
        tenantId: f.tenant.id,
        clientId: f.client.id,
        title: 'Due',
        assigneeId: f.member.id,
        dueDate: new Date('2026-09-07T07:00:00Z'),
      },
      {
        tenantId: f.tenant.id,
        clientId: f.client.id,
        title: 'Overdue',
        assigneeId: f.member.id,
        dueDate: new Date('2026-09-07T05:00:00Z'),
      },
      {
        tenantId: f.tenant.id,
        clientId: f.client.id,
        title: 'Completed',
        status: 'DONE',
        dueDate: new Date('2026-09-07T05:00:00Z'),
      },
      {
        tenantId: foreign.tenant.id,
        clientId: foreign.client.id,
        title: 'Hidden',
        dueDate: now,
      },
    ],
  });
  await prisma.deal.update({
    where: { id: f.deal.id },
    data: {
      ownerId: f.member.id,
      nextActionAt: null,
      lastActivityAt: new Date('2026-08-01'),
      expectedCloseDate: new Date('2026-09-08'),
    },
  });
  const result = await command.get(
    { ...f.user, userId: f.member.id },
    'America/Mexico_City',
    now,
  );
  expect(result.dueToday.count).toBe(1);
  expect(result.overdue.count).toBe(1);
  expect(result.closingThisWeek.count).toBe(1);
  expect(result.noNextAction.count).toBe(1);
  expect(result.staleDeals.count).toBe(1);
  await actions.close(f.deal.id, { status: 'WON' }, f.user);
  expect(
    (await command.get(f.user, 'America/Mexico_City', now)).noNextAction.count,
  ).toBe(0);
});

it('preserves pre-migration rows and does not invent historical completion dates', async () => {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: 'phase1-legacy-task' },
  });
  expect(task.status).toBe('DONE');
  expect(task.priority).toBe('MEDIUM');
  expect(task.assigneeId).toBeNull();
  expect(task.completedAt).toBeNull();
  expect(task.createdAt.toISOString()).toBe('2020-01-01T00:00:00.000Z');
  expect(task.updatedAt.toISOString()).toBe('2020-01-02T00:00:00.000Z');
});

it('allows only one concurrent closing of a deal', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    actions.close(f.deal.id, { status: 'WON' }, f.user),
    actions.close(f.deal.id, { status: 'LOST', lossReason: 'price' }, f.user),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(
    await prisma.dealActivity.count({ where: { dealId: f.deal.id } }),
  ).toBe(1);
});
