import { randomBytes, randomUUID, createHash } from 'crypto';
import { Test } from '@nestjs/testing';
import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PulseConnectModule } from '../src/pulse-connect/connect.module';
import { PulseOAuthService } from '../src/pulse-connect/oauth.service';
import { PulseActionsService } from '../src/pulse-connect/actions.service';
import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { ClientsModule } from '../src/clients/clients.module';
import { DealsService } from '../src/deals/deals.service';
import { ClientsService } from '../src/clients/clients.service';
import { TasksService } from '../src/tasks/tasks.service';
import * as bcrypt from 'bcrypt';

const dbUrl = process.env.CONNECT_TEST_DATABASE_URL;
if (
  !dbUrl ||
  !['localhost', '127.0.0.1'].includes(new URL(dbUrl).hostname) ||
  new URL(dbUrl).pathname !== '/pulse_connect_test'
)
  throw new Error('Use the isolated local pulse_connect_test database');
process.env.DATABASE_URL = dbUrl;
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.PULSE_CONNECT_ENABLED = 'true';
process.env.PULSE_CONNECT_ORIGIN = 'http://127.0.0.1:4109';
process.env.PULSE_CONNECT_FRONTEND = 'http://127.0.0.1:3109';
process.env.PULSE_CONNECT_CLIENT_ID = 'pulse-isolated-test';
process.env.PULSE_CONNECT_REDIRECT_URIS = 'http://127.0.0.1:3109/callback';
const resource = `${process.env.PULSE_CONNECT_ORIGIN}/api/mcp`;
let app: INestApplication,
  db: PrismaService,
  oauth: PulseOAuthService,
  actions: PulseActionsService;
let a: any, b: any;
async function fixture(label: string) {
  const tenant = await db.tenant.create({ data: { name: `Connect ${label}` } });
  const password = 'isolated-test-password';
  const owner = await db.user.create({
    data: {
      tenantId: tenant.id,
      email: `${randomUUID()}@example.test`,
      name: 'Owner',
      password: await bcrypt.hash(password, 4),
      role: 'OWNER',
    },
  });
  const member = await db.user.create({
    data: {
      tenantId: tenant.id,
      email: `${randomUUID()}@example.test`,
      name: 'Eduardo Test',
      password: await bcrypt.hash(password, 4),
      role: 'MEMBER',
    },
  });
  const pipeline = await db.pipeline.create({
    data: { tenantId: tenant.id, name: 'Test sales' },
  });
  const stage = await db.stage.create({
    data: {
      tenantId: tenant.id,
      pipelineId: pipeline.id,
      name: 'New',
      position: 0,
    },
  });
  const next = await db.stage.create({
    data: {
      tenantId: tenant.id,
      pipelineId: pipeline.id,
      name: 'Qualified',
      position: 1,
    },
  });
  const won = await db.stage.create({
    data: {
      tenantId: tenant.id,
      pipelineId: pipeline.id,
      name: 'Won',
      position: 2,
      status: 'WON',
    },
  });
  const auth = app.get(AuthService);
  const session = await auth.login({ email: member.email, password });
  const ownerSession = await auth.login({ email: owner.email, password });
  const user = { userId: member.id, tenantId: tenant.id, email: member.email };
  return {
    tenant,
    member,
    owner,
    pipeline,
    stage,
    next,
    won,
    session,
    ownerSession,
    user,
  };
}
async function begin(scopes = 'pulse:read pulse:write offline_access') {
  const verifier = randomBytes(32).toString('base64url');
  const query = {
    client_id: process.env.PULSE_CONNECT_CLIENT_ID!,
    redirect_uri: process.env.PULSE_CONNECT_REDIRECT_URIS!,
    resource,
    response_type: 'code',
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    state: randomUUID(),
    scope: scopes,
  };
  const response = await request(app.getHttpServer())
    .get('/api/oauth/authorize')
    .query(query)
    .expect(302);
  return {
    verifier,
    query,
    id: new URL(response.headers.location).searchParams.get('request')!,
  };
}
async function authorize(f = a, scopes?: string, write = true) {
  const start = await begin(scopes);
  await request(app.getHttpServer())
    .get(`/api/oauth/requests/${start.id}`)
    .auth(f.session.token, { type: 'bearer' })
    .expect(200);
  const consent = await request(app.getHttpServer())
    .post(`/api/oauth/requests/${start.id}`)
    .auth(f.session.token, { type: 'bearer' })
    .send({ allow: true, write, timeZone: 'America/Mexico_City' })
    .expect(200);
  const callback = new URL(consent.body.redirect);
  expect(callback.searchParams.get('state')).toBe(start.query.state);
  expect(callback.searchParams.get('iss')).toBe(
    process.env.PULSE_CONNECT_ORIGIN,
  );
  const tokenBody = {
    client_id: start.query.client_id,
    resource,
    grant_type: 'authorization_code',
    code: callback.searchParams.get('code')!,
    redirect_uri: start.query.redirect_uri,
    code_verifier: start.verifier,
  };
  const response = await request(app.getHttpServer())
    .post('/api/oauth/token')
    .type('form')
    .send(tokenBody)
    .expect(200);
  const ctx = await oauth.authenticate(`Bearer ${response.body.access_token}`);
  return { ...response.body, ctx, tokenBody, start };
}
const mcp = async (token: string, name: string, args: any) => {
  const r = await request(app.getHttpServer())
    .post('/api/mcp')
    .auth(token, { type: 'bearer' })
    .set('Accept', 'application/json, text/event-stream')
    .send({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    })
    .expect(200);
  return r.body.result;
};
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
      PrismaModule,
      AuthModule,
      ClientsModule,
      PulseConnectModule,
    ],
  }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api', {
    exclude: [
      {
        path: '.well-known/oauth-authorization-server',
        method: RequestMethod.GET,
      },
      {
        path: '.well-known/oauth-protected-resource/api/mcp',
        method: RequestMethod.GET,
      },
      {
        path: '.well-known/oauth-protected-resource',
        method: RequestMethod.GET,
      },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );
  await app.listen(0, '127.0.0.1');
  db = app.get(PrismaService);
  oauth = app.get(PulseOAuthService);
  actions = app.get(PulseActionsService);
  a = await fixture('A');
  b = await fixture('B');
}, 120_000);
afterAll(async () => {
  await app?.close();
});

test('discovery and unauthenticated MCP challenge, invalid redirect/resource/PKCE', async () => {
  const d = await request(app.getHttpServer())
    .get('/.well-known/oauth-authorization-server')
    .expect(200);
  expect(d.body.code_challenge_methods_supported).toEqual(['S256']);
  const p = await request(app.getHttpServer())
    .get('/.well-known/oauth-protected-resource/api/mcp')
    .expect(200);
  expect(p.body.resource).toBe(resource);
  const unauth = await request(app.getHttpServer())
    .post('/api/mcp')
    .send({})
    .expect(401);
  expect(unauth.headers['www-authenticate']).toContain('resource_metadata');
  const s = await begin();
  for (const bad of [
    { redirect_uri: 'https://evil.example/callback' },
    { resource: 'https://evil.example' },
    { code_challenge_method: 'plain' },
    { scope: 'admin' },
  ])
    await request(app.getHttpServer())
      .get('/api/oauth/authorize')
      .query({ ...s.query, ...bad })
      .expect(400);
});
test('OAuth consent, PKCE, code replay, hashing, MCP initialize/list and read/write metadata', async () => {
  const t = await authorize();
  await request(app.getHttpServer())
    .post('/api/oauth/token')
    .type('form')
    .send(t.tokenBody)
    .expect(400);
  expect(
    await db.pulseOAuthToken.findUnique({ where: { hash: t.access_token } }),
  ).toBeNull();
  expect(t.ctx.user.tenantId).toBe(a.tenant.id);
  expect(t.ctx.timeZone).toBe('America/Mexico_City');
  const initialized = await request(app.getHttpServer())
    .post('/api/mcp')
    .auth(t.access_token, { type: 'bearer' })
    .set('Accept', 'application/json, text/event-stream')
    .send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'integration-test', version: '1' },
      },
    })
    .expect(200);
  expect(initialized.body.result.serverInfo.name).toBe('pulse-crm');
  const listed = await request(app.getHttpServer())
    .post('/api/mcp')
    .auth(t.access_token, { type: 'bearer' })
    .set('Accept', 'application/json, text/event-stream')
    .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    .expect(200);
  expect(listed.body.result.tools).toHaveLength(14);
  expect(
    listed.body.result.tools.find((t: any) => t.name === 'pulse_create_contact')
      .annotations.readOnlyHint,
  ).toBe(false);
  expect(
    listed.body.result.tools.some((t: any) => /delete|send|bulk/.test(t.name)),
  ).toBe(false);
  expect(
    (await mcp(t.access_token, 'pulse_context', {})).structuredContent.result
      .timeZone,
  ).toBe('America/Mexico_City');
});
test('wrong PKCE and resource do not consume authorization code; explicit zone and denial', async () => {
  const s = await begin();
  await expect(oauth.consent(s.id, { allow: true }, a.user)).rejects.toThrow(
    'Confirm an IANA',
  );
  await expect(
    oauth.consent(s.id, { allow: true, timeZone: 'not-a-zone' }, a.user),
  ).rejects.toThrow('Invalid IANA');
  await expect(
    oauth.consent(
      s.id,
      { allow: true, timeZone: 'UTC' },
      { ...a.user, supportImpersonation: true },
    ),
  ).rejects.toThrow('own Pulse account');
  const c = await oauth.consent(
    s.id,
    { allow: true, write: true, timeZone: 'America/Mexico_City' },
    a.user,
  );
  const body = {
    client_id: s.query.client_id,
    resource,
    grant_type: 'authorization_code',
    code: new URL(c.redirect).searchParams.get('code')!,
    redirect_uri: s.query.redirect_uri,
    code_verifier: s.verifier,
  };
  await expect(
    oauth.exchange({
      ...body,
      code_verifier: randomBytes(32).toString('base64url'),
    }),
  ).rejects.toThrow();
  await expect(
    oauth.exchange({ ...body, resource: 'https://other.example' }),
  ).rejects.toThrow();
  expect((await oauth.exchange(body)).access_token).toBeTruthy();
  const denied = await begin();
  const url = new URL(
    (await oauth.consent(denied.id, { allow: false }, a.user)).redirect,
  );
  expect(url.searchParams.get('error')).toBe('access_denied');
  expect(url.searchParams.has('code')).toBe(false);
});
test('atomic real prospect + 50,000 MXN Deal + follow-up, concurrent retry, UI API visibility and audit', async () => {
  const t = await authorize();
  const input = {
    operationId: randomUUID(),
    contact: {
      firstName: 'Carlos',
      name: 'López',
      email: `carlos-${randomUUID()}@example.test`,
      phone: '+52 555 010 2020',
    },
    opportunity: {
      title: 'Carlos financing',
      value: 50000,
      currency: 'MXN',
      pipelineId: a.pipeline.id,
      stageId: a.stage.id,
    },
    task: { title: 'Relance martes', dueDate: '2026-10-20T10:00:00-06:00' },
  };
  const [r1, r2] = await Promise.all([
    mcp(t.access_token, 'pulse_create_prospect_opportunity_followup', input),
    mcp(t.access_token, 'pulse_create_prospect_opportunity_followup', input),
  ]);
  expect(r1.isError).not.toBe(true);
  expect(r2.isError).not.toBe(true);
  const result = r1.structuredContent.result;
  expect(r2.structuredContent.result).toEqual(result);
  expect(
    [r1.structuredContent.replayed, r2.structuredContent.replayed].sort(),
  ).toEqual([false, true]);
  expect(await db.client.count({ where: { email: input.contact.email } })).toBe(
    1,
  );
  expect(await db.deal.count({ where: { clientId: result.client.id } })).toBe(
    1,
  );
  expect(await db.task.count({ where: { clientId: result.client.id } })).toBe(
    1,
  );
  const ui = await request(app.getHttpServer())
    .get(`/api/clients/${result.client.id}`)
    .auth(a.session.token, { type: 'bearer' })
    .expect(200);
  expect(ui.body.clientStatus).toBe('PROSPECT');
  const deal = await new DealsService(db).findOne(
    result.opportunity.id,
    a.user,
  );
  expect(Number(deal.value)).toBe(50000);
  const task = await db.task.findUniqueOrThrow({
    where: { id: result.task.id },
  });
  expect(task.assigneeId).toBe(a.member.id);
  expect(task.dueDate!.toISOString()).toBe('2026-10-20T16:00:00.000Z');
  const receipt = await db.pulseActionReceipt.findFirstOrThrow({
    where: { operationId: input.operationId },
  });
  expect(receipt.userId).toBe(a.member.id);
  expect(JSON.stringify(receipt)).not.toContain(t.access_token);
  const changed = await mcp(
    t.access_token,
    'pulse_create_prospect_opportunity_followup',
    { ...input, task: { ...input.task, title: 'different' } },
  );
  expect(changed.isError).toBe(true);
  expect(JSON.parse(changed.content[0].text).status).toBe(409);
  const found: any = await actions.execute(
    'pulse_search_opportunities',
    { clientId: result.client.id },
    t.ctx,
  );
  expect(found.result.opportunities.map((d: any) => d.id)).toContain(
    result.opportunity.id,
  );
  a.created = result;
  a.createdInput = input;
});
test('modification, version conflicts and legal stage move use the real business services', async () => {
  const t = await authorize();
  const c = a.created;
  const updated: any = await actions.execute(
    'pulse_update_contact',
    {
      operationId: randomUUID(),
      expectedUpdatedAt: c.client.updatedAt,
      clientId: c.client.id,
      changes: { phone: '+52 555 999 8888' },
    },
    t.ctx,
  );
  expect(updated.result.phone).toBe('+52 555 999 8888');
  await expect(
    actions.execute(
      'pulse_update_contact',
      {
        operationId: randomUUID(),
        expectedUpdatedAt: c.client.updatedAt,
        clientId: c.client.id,
        changes: { phone: '+52 555 999 1111' },
      },
      t.ctx,
    ),
  ).rejects.toThrow('Record changed');
  const d: any = await actions.execute(
    'pulse_get_opportunity',
    { dealId: c.opportunity.id },
    t.ctx,
  );
  const changed: any = await actions.execute(
    'pulse_update_opportunity',
    {
      operationId: randomUUID(),
      expectedUpdatedAt: d.result.updatedAt.toISOString(),
      dealId: c.opportunity.id,
      changes: { value: 51000, currency: 'MXN' },
    },
    t.ctx,
  );
  const moved: any = await actions.execute(
    'pulse_move_opportunity',
    {
      operationId: randomUUID(),
      expectedUpdatedAt: changed.result.updatedAt.toISOString(),
      dealId: c.opportunity.id,
      stageId: a.next.id,
    },
    t.ctx,
  );
  expect(moved.result.stageId).toBe(a.next.id);
  expect(
    await db.dealStageHistory.count({
      where: { dealId: c.opportunity.id, toStageId: a.next.id },
    }),
  ).toBe(1);
  await expect(
    actions.execute(
      'pulse_move_opportunity',
      {
        operationId: randomUUID(),
        expectedUpdatedAt: moved.result.updatedAt.toISOString(),
        dealId: c.opportunity.id,
        stageId: a.won.id,
      },
      t.ctx,
    ),
  ).rejects.toThrow('OPEN stage');
});
test('cross-tenant and member ownership restrictions; spoofed selectors and task relationships', async () => {
  const ta = await authorize(),
    tb = await authorize(b);
  await expect(
    actions.execute(
      'pulse_get_contact',
      { clientId: a.created.client.id },
      tb.ctx,
    ),
  ).rejects.toThrow('not found');
  await expect(
    actions.execute(
      'pulse_get_opportunity',
      { dealId: a.created.opportunity.id },
      tb.ctx,
    ),
  ).rejects.toThrow('not found');
  const ownerClient = await db.client.create({
    data: {
      tenantId: a.tenant.id,
      name: 'Shared workspace contact',
      ownerUserId: a.owner.id,
    },
  });
  const shared: any = await actions.execute(
    'pulse_get_contact',
    { clientId: ownerClient.id },
    ta.ctx,
  );
  expect(shared.result.id).toBe(
    (await new ClientsService(db).findOne(ownerClient.id, a.user)).id,
  );
  const sharedTask = await db.task.create({
    data: {
      tenantId: a.tenant.id,
      clientId: ownerClient.id,
      title: 'Shared CRM task',
      assigneeId: a.owner.id,
    },
  });
  const sharedList: any = await actions.execute('pulse_tasks', {}, ta.ctx);
  expect(sharedList.result.tasks.some((t: any) => t.id === sharedTask.id)).toBe(
    true,
  );
  const ownerDeal = await db.deal.create({
    data: {
      tenantId: a.tenant.id,
      title: 'Owner private',
      value: 1,
      pipelineId: a.pipeline.id,
      stageId: a.stage.id,
      ownerId: a.owner.id,
    },
  });
  await expect(
    actions.execute('pulse_get_opportunity', { dealId: ownerDeal.id }, ta.ctx),
  ).rejects.toThrow('not found');
  await expect(
    actions.execute(
      'pulse_create_task',
      {
        operationId: randomUUID(),
        clientId: a.created.client.id,
        opportunityId: ownerDeal.id,
        task: { title: 'Blocked', dueDate: '2026-10-20T10:00:00-06:00' },
      },
      ta.ctx,
    ),
  ).rejects.toThrow('not found');
  for (const extra of [
    { tenantId: b.tenant.id },
    { ownerId: a.owner.id },
    { userId: a.owner.id },
  ])
    await expect(
      actions.execute(
        'pulse_search_contacts',
        { query: 'Carlos', ...extra },
        ta.ctx,
      ),
    ).rejects.toThrow();
  const otherClient = await db.client.create({
    data: {
      tenantId: a.tenant.id,
      name: 'Another client',
      ownerUserId: a.member.id,
    },
  });
  await expect(
    actions.execute(
      'pulse_create_task',
      {
        operationId: randomUUID(),
        clientId: otherClient.id,
        opportunityId: a.created.opportunity.id,
        task: { title: 'Mismatch', dueDate: '2026-10-20T10:00:00-06:00' },
      },
      ta.ctx,
    ),
  ).rejects.toThrow('same contact');
});
test('homonyms, duplicate phone/email and all-or-nothing rollback; retry after failure', async () => {
  const t = await authorize();
  await db.client.createMany({
    data: [1, 2].map((i) => ({
      tenantId: a.tenant.id,
      name: 'Homonym',
      firstName: 'Carlos',
      email: `h${i}-${randomUUID()}@example.test`,
      ownerUserId: a.member.id,
    })),
  });
  const found: any = await actions.execute(
    'pulse_search_contacts',
    { query: 'Carlos Homonym' },
    t.ctx,
  );
  expect(found.result.requiresChoice).toBe(true);
  expect(found.result.total).toBe(2);
  await expect(
    actions.execute(
      'pulse_create_contact',
      { operationId: randomUUID(), contact: a.createdInput.contact },
      t.ctx,
    ),
  ).rejects.toThrow();
  const broken = {
    ...a.createdInput,
    operationId: randomUUID(),
    contact: {
      name: 'Rollback Test',
      email: `rollback-${randomUUID()}@example.test`,
    },
    task: { title: 'Rollback task', dueDate: '2026-10-20T10:00:00-06:00' },
    opportunity: { ...a.createdInput.opportunity, stageId: b.stage.id },
  };
  await expect(
    actions.execute(
      'pulse_create_prospect_opportunity_followup',
      broken,
      t.ctx,
    ),
  ).rejects.toThrow('OPEN stage');
  expect(
    await db.client.count({ where: { email: broken.contact.email } }),
  ).toBe(0);
  expect(
    await db.pulseActionReceipt.count({
      where: { operationId: broken.operationId },
    }),
  ).toBe(0);
  const fixed: any = await actions.execute(
    'pulse_create_prospect_opportunity_followup',
    { ...broken, opportunity: { ...broken.opportunity, stageId: a.stage.id } },
    t.ctx,
  );
  expect(fixed.result.atomic).toBe(true);
});
test('read-only grant refuses writes; revocation is personal and invalidates access and refresh', async () => {
  const read = await authorize(a, 'pulse:read offline_access', false);
  const result = await mcp(read.access_token, 'pulse_create_contact', {
    operationId: randomUUID(),
    contact: { name: 'No write' },
  });
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).status).toBe(403);
  expect(result._meta['mcp/www_authenticate'][0]).toContain(
    'insufficient_scope',
  );
  await oauth.revokeConnection(read.ctx.grantId, b.user);
  expect(
    (await oauth.authenticate(`Bearer ${read.access_token}`)).user.userId,
  ).toBe(a.member.id);
  await request(app.getHttpServer())
    .post(`/api/oauth/connections/${read.ctx.grantId}/revoke`)
    .auth(a.session.token, { type: 'bearer' })
    .expect(200);
  await expect(
    oauth.authenticate(`Bearer ${read.access_token}`),
  ).rejects.toThrow('revoked');
  await expect(
    oauth.exchange({
      client_id: process.env.PULSE_CONNECT_CLIENT_ID!,
      resource,
      grant_type: 'refresh_token',
      refresh_token: read.refresh_token,
    }),
  ).rejects.toThrow();
});
test('refresh rotation, replay revocation and access expiry', async () => {
  const t = await authorize();
  const body = {
    client_id: process.env.PULSE_CONNECT_CLIENT_ID!,
    resource,
    grant_type: 'refresh_token',
    refresh_token: t.refresh_token,
  };
  const fresh = await oauth.exchange(body);
  expect(fresh.refresh_token).not.toBe(t.refresh_token);
  await expect(oauth.exchange(body)).rejects.toThrow();
  await expect(
    oauth.authenticate(`Bearer ${fresh.access_token}`),
  ).rejects.toThrow('revoked');
  const expired = await authorize();
  await db.pulseOAuthToken.updateMany({
    where: { grantId: expired.ctx.grantId, kind: 'access' },
    data: { expiresAt: new Date(0) },
  });
  await expect(
    oauth.authenticate(`Bearer ${expired.access_token}`),
  ).rejects.toThrow();
});
test('invalid fields, negative amount and timezone-free dates never create records', async () => {
  const t = await authorize();
  for (const change of [
    { value: -1 },
    { currency: 'XYZ' },
    { value: 0.001 },
    { pipelineId: 'not-a-uuid' },
  ])
    await expect(
      actions.execute(
        'pulse_create_opportunity',
        {
          operationId: randomUUID(),
          clientId: a.created.client.id,
          opportunity: { ...a.createdInput.opportunity, ...change },
        },
        t.ctx,
      ),
    ).rejects.toThrow();
  await expect(
    actions.execute(
      'pulse_create_task',
      {
        operationId: randomUUID(),
        clientId: a.created.client.id,
        task: { title: 'Bad date', dueDate: '2026-10-20' },
      },
      t.ctx,
    ),
  ).rejects.toThrow();
});

test('subscription suspension and removed membership invalidate live connections', async () => {
  const f = await fixture('suspension');
  const t = await authorize(f);
  const subscription = await db.subscription.create({
    data: {
      tenantId: a.tenant.id,
      customerTenantId: f.tenant.id,
      customerName: 'Suspended isolated test',
      status: 'PAUSED',
    },
  });
  await expect(oauth.authenticate(`Bearer ${t.access_token}`)).rejects.toThrow(
    'not active',
  );
  await expect(actions.execute('pulse_context', {}, t.ctx)).rejects.toThrow(
    'inactive',
  );
  await db.subscription.update({
    where: { id: subscription.id },
    data: { status: 'ACTIVE' },
  });
  await db.user.delete({ where: { id: f.member.id } });
  await expect(oauth.authenticate(`Bearer ${t.access_token}`)).rejects.toThrow(
    'membership',
  );
});
test('task persistence failure rolls back the already created contact and Deal', async () => {
  const t = await authorize();
  const operationId = randomUUID();
  const data = {
    ...a.createdInput,
    operationId,
    contact: {
      name: 'Atomic task failure',
      email: `atomic-${randomUUID()}@example.test`,
    },
  };
  const before = await db.deal.count({ where: { tenantId: a.tenant.id } });
  const fail = jest
    .spyOn(TasksService.prototype, 'create')
    .mockRejectedValueOnce(new Error('injected storage failure'));
  try {
    await expect(
      actions.execute(
        'pulse_create_prospect_opportunity_followup',
        data,
        t.ctx,
      ),
    ).rejects.toThrow('injected');
  } finally {
    fail.mockRestore();
  }
  expect(await db.client.count({ where: { email: data.contact.email } })).toBe(
    0,
  );
  expect(await db.deal.count({ where: { tenantId: a.tenant.id } })).toBe(
    before,
  );
  expect(await db.pulseActionReceipt.count({ where: { operationId } })).toBe(0);
});
test('RFC 7009 revocation endpoint invalidates the entire individual grant', async () => {
  const t = await authorize();
  await request(app.getHttpServer())
    .post('/api/oauth/revoke')
    .type('form')
    .send({
      client_id: process.env.PULSE_CONNECT_CLIENT_ID,
      token: t.refresh_token,
    })
    .expect(200);
  await expect(oauth.authenticate(`Bearer ${t.access_token}`)).rejects.toThrow(
    'revoked',
  );
  await request(app.getHttpServer())
    .post('/api/oauth/revoke')
    .type('form')
    .send({
      client_id: process.env.PULSE_CONNECT_CLIENT_ID,
      token: 'unknown-token',
    })
    .expect(200);
});

test('empty callback allowlist permits discovery but no authorization; malformed OAuth fields are rejected', async () => {
  const previous = process.env.PULSE_CONNECT_REDIRECT_URIS;
  const start = await begin();
  try {
    process.env.PULSE_CONNECT_REDIRECT_URIS = '';
    expect(oauth.metadata().code_challenge_methods_supported).toEqual(['S256']);
    await expect(oauth.begin(start.query)).rejects.toThrow();
  } finally {
    process.env.PULSE_CONNECT_REDIRECT_URIS = previous;
  }
  await expect(
    oauth.begin({ ...start.query, scope: ['pulse:read'] } as any),
  ).rejects.toThrow();
  await expect(oauth.exchange({ grant_type: {} } as any)).rejects.toThrow();
});
