import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import { SignaturesService } from './signatures.service';
import { SignaturePdfService } from './signature-pdf.service';
import { digest, auditDigest } from './signature.validation';
import type { SignatureEnvelope } from './signature.types';

const actor = {
  userId: 'owner',
  tenantId: 'tenant',
  email: 'sender@example.test',
};
const recipients = [
  { id: 'one', name: 'Élodie García', email: 'one@example.test' },
  { id: 'two', name: 'Pierre Martin', email: 'two@example.test' },
];
const field = (id: string, recipientId: string, type = 'signature') => ({
  id,
  recipientId,
  type,
  page: 1,
  x: 0.1,
  y: 0.4,
  width: 0.35,
  height: 0.06,
  label: id,
  required: true,
});
class MemoryDatabase {
  rows = new Map<string, SignatureEnvelope>();
  user = { findFirst: jest.fn(async () => ({ role: 'OWNER' })) };
  tenant = { findUnique: jest.fn(async () => ({ name: 'Test workspace' })) };
  async $queryRaw(parts: TemplateStringsArray, ...args: any[]) {
    const sql = parts.join('?');
    let rows = [...this.rows.values()];
    if (sql.includes("->'recipients'"))
      rows = rows.filter((e) =>
        e.recipients.some(
          (r) => r.tokenHash === JSON.parse(args[0])[0].tokenHash,
        ),
      );
    else if (sql.includes('"id"=?'))
      rows = rows.filter(
        (e) =>
          e.id === args[0] &&
          (!sql.includes('"tenantId"=?') || e.tenantId === args[1]),
      );
    else if (sql.includes('"tenantId"=?'))
      rows = rows.filter((e) => e.tenantId === args[0]);
    return structuredClone(rows.map((data) => ({ data })));
  }
  async $executeRaw(parts: TemplateStringsArray, ...args: any[]) {
    if (parts.join('').startsWith('INSERT'))
      this.rows.set(args[0], JSON.parse(args[2]));
    else this.rows.set(args[1], JSON.parse(args[0]));
    return 1;
  }
  async $transaction(fn: (tx: MemoryDatabase) => Promise<unknown>) {
    const snapshot = structuredClone(this.rows);
    try {
      return await fn(this);
    } catch (e) {
      this.rows = snapshot;
      throw e;
    }
  }
}
describe('native signature workflow', () => {
  let db: MemoryDatabase, service: SignaturesService, root: string;
  const mail = {
    ready: jest.fn(async () => ({})),
    status: jest.fn(async () => ({ configured: true })),
    send: jest.fn(async (..._args: any[]) => {}),
  };
  beforeEach(async () => {
    jest.clearAllMocks();
    db = new MemoryDatabase();
    root = await mkdtemp(join(tmpdir(), 'o7-sign-test-'));
    service = new SignaturesService(
      db as any,
      new SignaturePdfService(),
      mail as any,
    );
    (service as any).root = () => root;
    process.env.FRONTEND_URL = 'https://crm.example.test';
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  async function draft(two = false) {
    const e = await service.create(
      {
        title: 'Contrat signé',
        text: 'Contrat pour {{name}}',
        variables: { name: 'Élodie García' },
        language: 'fr',
      },
      actor,
    );
    return service.update(
      e.id,
      {
        recipients: two ? recipients : recipients.slice(0, 1),
        fields: two
          ? [
              field('signature-one', 'one'),
              field('signature-two', 'two'),
              field('initials', 'one', 'initials'),
              field('date', 'one', 'date'),
            ]
          : [field('signature-one', 'one')],
      },
      actor,
    );
  }
  function invitationToken(address: string) {
    const call = mail.send.mock.calls.find(
      (c) => c[1] === address && String(c[3]).includes('/sign/'),
    );
    return String(call?.[3]).match(/\/sign\/([a-f0-9]{64})/)![1];
  }
  async function verify(token: string) {
    await service.requestCode(token, '127.0.0.1');
    const call = mail.send.mock.calls.at(-1)!;
    const code = String(call[3]).match(/\n(\d{6})\n/)![1];
    return { code, ...(await service.verify(token, { code }, '127.0.0.1')) };
  }
  it('separates tenants and rechecks workspace administration', async () => {
    const e = await draft();
    await expect(
      service.get(e.id, { ...actor, tenantId: 'foreign' }),
    ).rejects.toThrow('Document not found');
    expect(await service.list({ ...actor, tenantId: 'foreign' })).toEqual([]);
    db.user.findFirst.mockResolvedValueOnce({ role: 'USER' });
    await expect(service.ownerPdf(e.id, actor)).rejects.toThrow(
      'Admin access required',
    );
  });
  it('requires signatures for each recipient and keeps documents editable until sent', async () => {
    const e = await draft();
    await service.update(
      e.id,
      { fields: [field('initials', 'one', 'initials')] },
      actor,
    );
    await expect(service.send(e.id, actor)).rejects.toThrow(
      'required signature',
    );
    expect(db.rows.get(e.id)?.status).toBe('DRAFT');
    expect(mail.send).not.toHaveBeenCalled();
  });
  it('protects PDF access, consumes codes and records failed attempts', async () => {
    const e = await draft();
    await service.send(e.id, actor);
    const token = invitationToken(recipients[0].email);
    await expect(service.signerPdf(token, '')).rejects.toThrow(
      'Verify your email first',
    );
    await service.requestCode(token, '127.0.0.1');
    const code = String(mail.send.mock.calls.at(-1)![3]).match(
      /\n(\d{6})\n/,
    )![1];
    await expect(
      service.verify(
        token,
        { code: code === '111111' ? '222222' : '111111' },
        'ip',
      ),
    ).rejects.toThrow('Incorrect code');
    expect(db.rows.get(e.id)?.recipients[0].codeAttempts).toBe(1);
    const { session } = await service.verify(token, { code }, 'ip');
    await expect(service.verify(token, { code }, 'ip')).rejects.toThrow(
      'Code expired',
    );
    await expect(service.signerPdf(token, 'wrong-session')).rejects.toThrow(
      'Verify your email again',
    );
    expect(
      (await service.signerPdf(token, session!)).subarray(0, 5).toString(),
    ).toBe('%PDF-');
    await expect(service.requestCode(token, 'ip')).rejects.toThrow('Wait');
    const returned = JSON.stringify(await service.get(e.id, actor));
    expect(returned).not.toContain(token);
    expect(returned).not.toContain('codeHash');
    expect(returned).not.toContain(session!);
  });
  it('locks the sent document, limits recipients to their own fields, and completes once', async () => {
    const e = await draft(true);
    await service.send(e.id, actor);
    const one = invitationToken(recipients[0].email),
      two = invitationToken(recipients[1].email);
    const s1 = await verify(one),
      s2 = await verify(two);
    await expect(
      service.update(e.id, { title: 'changed' }, actor),
    ).rejects.toThrow('Only a draft');
    await expect(
      service.sign(one, s1.session!, { consent: false, values: {} }, 'ip'),
    ).rejects.toThrow('Accept');
    await expect(
      service.sign(
        one,
        s1.session!,
        {
          consent: true,
          values: {
            'signature-one': { text: 'Élodie García' },
            initials: { text: 'ÉG' },
            'signature-two': { text: 'forged' },
          },
        },
        'ip',
      ),
    ).rejects.toThrow('another signatory');
    expect(db.rows.get(e.id)?.recipients[0].signedAt).toBeUndefined();
    expect(
      await service.sign(
        one,
        s1.session!,
        {
          consent: true,
          values: {
            'signature-one': { text: 'Élodie García' },
            initials: { text: 'ÉG' },
          },
        },
        'ip',
      ),
    ).toEqual({ completed: false, alreadySigned: false });
    expect(
      (await service.signerDocument(one, s1.session!)).fields.map((f) => f.id),
    ).not.toContain('signature-two');
    await expect(service.ownerPdf(e.id, actor, true)).rejects.toThrow(
      'not fully signed',
    );
    expect(
      await service.sign(
        two,
        s2.session!,
        {
          consent: true,
          values: { 'signature-two': { text: 'Pierre Martin' } },
        },
        'ip',
      ),
    ).toEqual({ completed: true, alreadySigned: false });
    const pdf = await service.ownerPdf(e.id, actor, true);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2);
    expect(db.rows.get(e.id)?.signedHash).toBe(digest(pdf));
    expect(db.rows.get(e.id)?.completionDelivery).toBe('SENT');
    const sends = mail.send.mock.calls.length;
    expect(
      (
        await service.sign(
          two,
          s2.session!,
          { consent: true, values: {} },
          'ip',
        )
      ).alreadySigned,
    ).toBe(true);
    expect(mail.send).toHaveBeenCalledTimes(sends);
    await expect(service.void(e.id, actor)).rejects.toThrow(
      'cannot be cancelled',
    );
    const events = db.rows.get(e.id)!.audit;
    events.forEach((event, i) => {
      const { hash, ...rest } = event;
      expect(hash).toBe(auditDigest(rest));
      expect(event.previous).toBe(i ? events[i - 1].hash : e.originalHash);
    });
  });
  it('rejects malformed drawing before recording any signature', async () => {
    const e = await draft();
    await service.send(e.id, actor);
    const token = invitationToken(recipients[0].email),
      s = await verify(token);
    await expect(
      service.sign(
        token,
        s.session!,
        {
          consent: true,
          values: {
            'signature-one': { image: 'data:image/png;base64,bm90LXBuZw==' },
          },
        },
        'ip',
      ),
    ).rejects.toThrow('Invalid signature image');
    expect(db.rows.get(e.id)?.recipients[0].signedAt).toBeUndefined();
  });
  it('rotates links on resend and cancellation revokes access', async () => {
    const e = await draft();
    await service.send(e.id, actor);
    const old = invitationToken(recipients[0].email);
    mail.send.mockClear();
    await service.send(e.id, actor, true);
    const next = invitationToken(recipients[0].email);
    expect(next).not.toBe(old);
    await expect(service.landing(old)).rejects.toThrow('not found');
    await service.void(e.id, actor);
    await expect(service.landing(next)).rejects.toThrow(
      'expired or was cancelled',
    );
  });
  it('reports invitation failures and refuses an unconfigured connector', async () => {
    const e = await draft();
    mail.ready.mockRejectedValueOnce(new Error('Connector missing'));
    await expect(service.send(e.id, actor)).rejects.toThrow(
      'Connector missing',
    );
    expect(db.rows.get(e.id)?.status).toBe('DRAFT');
    mail.send.mockRejectedValueOnce(new Error('SMTP rejected'));
    const sent = await service.send(e.id, actor);
    expect(sent.recipients[0].delivery).toBe('FAILED');
    expect(db.rows.get(e.id)?.audit.at(-1)?.event).toBe(
      'invitation-mail-failed',
    );
  });
  it('rejects fields outside the PDF and invalid recipient assignments', async () => {
    const e = await draft();
    await expect(
      service.update(
        e.id,
        { fields: [{ ...field('bad', 'one'), x: 0.9 }] },
        actor,
      ),
    ).rejects.toThrow('fit on the PDF');
    await expect(
      service.update(e.id, { fields: [field('bad', 'unknown')] }, actor),
    ).rejects.toThrow('Unknown signatory');
  });
  it('expires links and verified sessions, and locks repeated wrong codes', async () => {
    const e = await draft();
    await service.send(e.id, actor);
    const token = invitationToken(recipients[0].email);
    await service.requestCode(token, 'ip');
    const actual = String(mail.send.mock.calls.at(-1)![3]).match(
      /\n(\d{6})\n/,
    )![1];
    const wrong = actual === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++)
      await expect(
        service.verify(token, { code: wrong }, 'ip'),
      ).rejects.toThrow('Incorrect code');
    await expect(service.verify(token, { code: actual }, 'ip')).rejects.toThrow(
      'locked',
    );
    db.rows.get(e.id)!.recipients[0].lastCodeAt = 0;
    const s = await verify(token);
    db.rows.get(e.id)!.recipients[0].sessionExpires = Date.now() - 1;
    await expect(service.signerDocument(token, s.session!)).rejects.toThrow(
      'Verify your email again',
    );
    db.rows.get(e.id)!.expiresAt = Date.now() - 1;
    await expect(service.landing(token)).rejects.toThrow('expired');
  });
  it('requires document variables before producing the source PDF', async () => {
    await expect(
      service.create(
        { title: 'Contract', text: 'Name: {{name}}', variables: {} },
        actor,
      ),
    ).rejects.toThrow('Complete document variable');
    expect(db.rows.size).toBe(0);
  });
});
