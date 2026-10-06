import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { randomUUID, randomInt, timingSafeEqual } from 'crypto';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/user.decorator';
import { requireWorkspaceAdmin } from '../common/workspace-permissions';
import { SignaturePdfService } from './signature-pdf.service';
import { SignatureMailService } from './signature-mail.service';
import type { SignatureEnvelope, SignatureRecipient } from './signature.types';
import {
  digest,
  secret,
  object,
  text,
  email,
  fields,
  signingValues,
  audit,
  publicEnvelope,
} from './signature.validation';

type Stored = { data: SignatureEnvelope };
@Injectable()
export class SignaturesService {
  constructor(
    private prisma: PrismaService,
    private pdf: SignaturePdfService,
    private mail: SignatureMailService,
  ) {}
  private root() {
    return join(process.cwd(), 'uploads', 'signatures');
  }
  private file(e: SignatureEnvelope, name: string) {
    return join(this.root(), e.id, name);
  }
  private compare(a: string, b: string) {
    return (
      a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
    );
  }
  private async admin(user: RequestUser) {
    await requireWorkspaceAdmin(this.prisma, user);
  }
  private async owned(id: string, user: RequestUser) {
    await this.admin(user);
    const rows = await this.prisma.$queryRaw<
      Stored[]
    >`SELECT "data" FROM "SignatureEnvelope" WHERE "id"=${id} AND "tenantId"=${user.tenantId}`;
    if (!rows[0]) throw new NotFoundException('Document not found');
    return rows[0].data;
  }
  private async byToken(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new NotFoundException('Signature link not found');
    const hash = digest(token);
    const match = JSON.stringify([{ tokenHash: hash }]);
    const rows = await this.prisma.$queryRaw<
      Stored[]
    >`SELECT "data" FROM "SignatureEnvelope" WHERE "data"->'recipients' @> ${match}::jsonb`;
    const e = rows[0]?.data;
    const r = e?.recipients.find((r) => r.tokenHash === hash);
    if (!e || !r) throw new NotFoundException('Signature link not found');
    if (!['SENT', 'COMPLETED'].includes(e.status) || e.expiresAt! < Date.now())
      throw new ForbiddenException(
        'This signature link has expired or was cancelled',
      );
    return { e, r };
  }
  private async mutate<T>(
    id: string,
    fn: (e: SignatureEnvelope) => Promise<T> | T,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          Stored[]
        >`SELECT "data" FROM "SignatureEnvelope" WHERE "id"=${id} FOR UPDATE`;
        if (!rows[0]) throw new NotFoundException('Document not found');
        const e = rows[0].data;
        const result = await fn(e);
        await tx.$executeRaw`UPDATE "SignatureEnvelope" SET "data"=${JSON.stringify(e)}::jsonb,"updatedAt"=NOW() WHERE "id"=${id}`;
        return result;
      },
      { timeout: 30000 },
    );
  }
  private requirePublic(
    e: SignatureEnvelope,
    recipientId: string,
    token: string,
    session?: string,
  ) {
    const r = e.recipients.find(
      (r) => r.id === recipientId && r.tokenHash === digest(token),
    );
    if (
      !r ||
      !['SENT', 'COMPLETED'].includes(e.status) ||
      e.expiresAt! < Date.now()
    )
      throw new ForbiddenException('Signature link unavailable');
    if (
      session &&
      (!r.sessionHash ||
        !this.compare(r.sessionHash, digest(session)) ||
        r.sessionExpires! < Date.now())
    )
      throw new ForbiddenException('Verify your email again');
    return r;
  }
  async settings(user: RequestUser) {
    await this.admin(user);
    return this.mail.status(user.tenantId);
  }
  async list(user: RequestUser) {
    await this.admin(user);
    const rows = await this.prisma.$queryRaw<
      Stored[]
    >`SELECT "data" FROM "SignatureEnvelope" WHERE "tenantId"=${user.tenantId} ORDER BY "createdAt" DESC LIMIT 100`;
    return rows.map((row) => publicEnvelope(row.data));
  }
  async get(id: string, user: RequestUser) {
    return publicEnvelope(await this.owned(id, user));
  }
  async create(raw: unknown, user: RequestUser, file?: Express.Multer.File) {
    await this.admin(user);
    const input = object(raw);
    const title = text(input.title, 150);
    let bytes: Buffer;
    if (file) {
      if (
        file.size > 10 * 1024 * 1024 ||
        !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))
      )
        throw new BadRequestException('Upload a PDF of maximum 10 MB');
      bytes = file.buffer;
    } else {
      const body = text(input.text, 60000);
      const rawVars = input.variables ? object(input.variables) : {};
      const variables: Record<string, string> = {};
      if (Object.keys(rawVars).length > 60)
        throw new BadRequestException('Maximum 60 document variables');
      for (const [key, value] of Object.entries(rawVars)) {
        if (!/^[\w.-]{1,80}$/.test(key))
          throw new BadRequestException('Invalid variable');
        variables[key] = text(value, 1000, false);
      }
      bytes = await this.pdf.generate(body, variables);
    }
    const inspected = await this.pdf.inspect(bytes);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true },
    });
    const id = randomUUID();
    const e: SignatureEnvelope = {
      id,
      tenantId: user.tenantId,
      ownerId: user.userId,
      ownerEmail: user.email,
      tenantName: tenant?.name || 'o7 CRM',
      title,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      pages: inspected.pages.length,
      pageSizes: inspected.pages,
      originalHash: digest(inspected.bytes),
      originalFile: 'original.pdf',
      recipients: [],
      fields: [],
      audit: [],
      language: ['fr', 'es'].includes(String(input.language))
        ? (input.language as 'fr' | 'es')
        : 'en',
    };
    audit(e, 'created', user.email);
    await mkdir(join(this.root(), id), { recursive: true, mode: 0o700 });
    await writeFile(this.file(e, e.originalFile), inspected.bytes, {
      mode: 0o600,
      flag: 'wx',
    });
    try {
      await this.prisma
        .$executeRaw`INSERT INTO "SignatureEnvelope"("id","tenantId","data") VALUES(${id},${user.tenantId},${JSON.stringify(e)}::jsonb)`;
    } catch (err) {
      await unlink(this.file(e, e.originalFile));
      throw err;
    }
    return publicEnvelope(e);
  }
  async update(id: string, raw: unknown, user: RequestUser) {
    await this.owned(id, user);
    const input = object(raw);
    return this.mutate(id, (e) => {
      if (e.tenantId !== user.tenantId || e.status !== 'DRAFT')
        throw new BadRequestException('Only a draft can be edited');
      if (input.title !== undefined) e.title = text(input.title, 150);
      if (input.recipients !== undefined) {
        if (!Array.isArray(input.recipients) || input.recipients.length > 5)
          throw new BadRequestException('Maximum 5 signatories');
        const emails = new Set<string>();
        const ids = new Set<string>();
        e.recipients = input.recipients.map((v) => {
          const r = object(v);
          const address = email(r.email),
            id = text(r.id, 100);
          if (emails.has(address) || ids.has(id))
            throw new BadRequestException('Duplicate signatory');
          emails.add(address);
          ids.add(id);
          return { id, name: text(r.name, 150), email: address };
        });
      }
      if (input.fields !== undefined) e.fields = fields(input.fields, e);
      audit(e, 'draft-updated', user.email);
      return publicEnvelope(e);
    });
  }
  private frontend() {
    const raw = (process.env.FRONTEND_URL || process.env.FRONTEND_URLS || '')
      .split(',')[0]
      .trim();
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException(
        'FRONTEND_URL must be configured for signature links',
      );
    }
    if (!['https:', 'http:'].includes(url.protocol))
      throw new BadRequestException('Invalid frontend URL');
    return url.origin;
  }
  async send(id: string, user: RequestUser, resend = false) {
    await this.owned(id, user);
    await this.mail.ready(user.tenantId);
    const origin = this.frontend();
    const jobs = await this.mutate(id, (e) => {
      if (
        e.tenantId !== user.tenantId ||
        (resend ? e.status !== 'SENT' : e.status !== 'DRAFT')
      )
        throw new BadRequestException(
          'Document cannot be sent in its current state',
        );
      if (resend && e.expiresAt! < Date.now())
        throw new BadRequestException(
          'Expired request: prepare a new document',
        );
      if (
        !e.recipients.length ||
        !e.fields.length ||
        e.recipients.some(
          (r) =>
            !e.fields.some(
              (f) =>
                f.recipientId === r.id && f.type === 'signature' && f.required,
            ),
        )
      )
        throw new BadRequestException(
          'Place a required signature field for every signatory',
        );
      e.expiresAt ||= Date.now() + 14 * 24 * 3600000;
      const jobs = e.recipients
        .filter((r) => !r.signedAt)
        .map((r) => {
          const token = secret();
          r.tokenHash = digest(token);
          delete r.codeHash;
          delete r.sessionHash;
          r.delivery = 'PENDING';
          delete r.deliveryError;
          return {
            id: r.id,
            name: r.name,
            email: r.email,
            token,
            title: e.title,
            tenantName: e.tenantName,
            language: e.language,
            expiresAt: new Date(e.expiresAt!).toISOString(),
          };
        });
      e.status = 'SENT';
      e.sentAt ||= new Date().toISOString();
      e.expiresAt ||= Date.now() + 14 * 24 * 3600000;
      audit(e, resend ? 'resent' : 'sent', user.email);
      return jobs;
    });
    await Promise.all(
      jobs.map(async (job) => {
        const url = `${origin}/sign/${job.token}`;
        const content =
          job.language === 'fr'
            ? `Bonjour ${job.name},\n\n${job.tenantName} vous invite à signer « ${job.title} ».\n\n${url}\n\nUn code envoyé à cette adresse vérifiera votre accès avant la signature. Expiration du lien : ${job.expiresAt}.\n\nSi vous n’attendiez pas ce document, contactez l’expéditeur.`
            : job.language === 'es'
              ? `Hola ${job.name},\n\n${job.tenantName} te invita a firmar « ${job.title} ».\n\n${url}\n\nVerifica tu correo con un código antes de firmar. Caducidad del enlace: ${job.expiresAt}.\n\nSi no esperabas este documento, contacta al remitente.`
              : `Hello ${job.name},\n\n${job.tenantName} invites you to sign “${job.title}”.\n\n${url}\n\nVerify your email with a code before signing. Link expiration: ${job.expiresAt}.\n\nIf you were not expecting this document, contact the sender.`;
        try {
          await this.mail.send(
            user.tenantId,
            job.email,
            `Signature · ${job.title}`,
            content,
          );
          await this.mutate(id, (e) => {
            const r = e.recipients.find((r) => r.id === job.id)!;
            if (r.tokenHash !== digest(job.token)) return;
            r.delivery = 'SENT';
            audit(e, 'invitation-mail-accepted', job.email);
          });
        } catch {
          await this.mutate(id, (e) => {
            const r = e.recipients.find((r) => r.id === job.id)!;
            if (r.tokenHash !== digest(job.token)) return;
            r.delivery = 'FAILED';
            r.deliveryError =
              'Mail delivery failed. Check this workspace’s Mailing connector, then resend.';
            audit(e, 'invitation-mail-failed', job.email);
          });
        }
      }),
    );
    return this.get(id, user);
  }
  async void(id: string, user: RequestUser) {
    await this.owned(id, user);
    return this.mutate(id, (e) => {
      if (e.tenantId !== user.tenantId || e.status === 'COMPLETED')
        throw new BadRequestException(
          'Completed documents cannot be cancelled',
        );
      e.status = 'VOID';
      for (const r of e.recipients) {
        delete r.sessionHash;
        delete r.codeHash;
      }
      audit(e, 'cancelled', user.email);
      return publicEnvelope(e);
    });
  }
  async ownerPdf(id: string, user: RequestUser, signed = false) {
    const e = await this.owned(id, user);
    if (signed && e.status !== 'COMPLETED')
      throw new BadRequestException('Document is not fully signed');
    return readFile(this.file(e, signed ? e.signedFile! : e.originalFile));
  }
  async ownerAudit(id: string, user: RequestUser) {
    const e = await this.owned(id, user);
    return { ...publicEnvelope(e), audit: e.audit };
  }
  async landing(token: string) {
    const { e, r } = await this.byToken(token);
    const [local, domain] = r.email.split('@');
    return {
      title: e.title,
      tenantName: e.tenantName,
      name: r.name,
      email: `${local.slice(0, 2)}***@${domain}`,
      status: e.status,
      signed: !!r.signedAt,
      language: e.language,
    };
  }
  async requestCode(token: string, ip: string) {
    const { e, r } = await this.byToken(token);
    await this.mail.ready(e.tenantId);
    const code = String(randomInt(100000, 1000000));
    await this.mutate(e.id, (current) => {
      const recipient = this.requirePublic(current, r.id, token);
      const now = Date.now();
      const requests = (recipient.codeRequests || []).filter(
        (t) => t > now - 3600000,
      );
      if ((recipient.lastCodeAt || 0) > now - 60000 || requests.length >= 6)
        throw new BadRequestException('Wait before requesting another code');
      recipient.codeRequests = [...requests, now];
      recipient.lastCodeAt = now;
      recipient.codeAttempts = 0;
      recipient.codeHash = digest(`${token}:${code}`);
      recipient.codeExpires = now + 10 * 60000;
      audit(current, 'email-code-requested', recipient.email, ip);
    });
    try {
      await this.mail.send(
        e.tenantId,
        r.email,
        `o7 · ${e.language === 'fr' ? 'Code de signature' : e.language === 'es' ? 'Código de firma' : 'Signing code'}`,
        `${r.name},\n\n${e.title}\n\n${code}\n\n${e.language === 'fr' ? 'Ce code est valable 10 minutes. Ne le partagez pas.' : e.language === 'es' ? 'Este código es válido durante 10 minutos. No lo compartas.' : 'This code is valid for 10 minutes. Do not share it.'}`,
      );
    } catch (err) {
      await this.mutate(e.id, (current) => {
        const recipient = current.recipients.find((x) => x.id === r.id)!;
        delete recipient.codeHash;
        audit(current, 'email-code-mail-failed', r.email, ip);
      });
      throw new BadRequestException(
        'The verification email could not be sent. Contact the document sender.',
      );
    }
    return { sent: true };
  }
  async verify(token: string, raw: unknown, ip: string) {
    const code = text(object(raw).code, 6);
    if (!/^\d{6}$/.test(code))
      throw new BadRequestException('Enter the six-digit code');
    const { e, r } = await this.byToken(token);
    const session = secret();
    const result = await this.mutate(e.id, (current) => {
      const recipient = this.requirePublic(current, r.id, token);
      if (
        !recipient.codeHash ||
        recipient.codeExpires! < Date.now() ||
        (recipient.codeAttempts || 0) >= 5
      )
        return { error: 'Code expired or locked. Request a new code.' };
      recipient.codeAttempts = (recipient.codeAttempts || 0) + 1;
      if (!this.compare(recipient.codeHash, digest(`${token}:${code}`))) {
        audit(current, 'email-code-rejected', recipient.email, ip);
        return { error: 'Incorrect code' };
      }
      delete recipient.codeHash;
      recipient.sessionHash = digest(session);
      recipient.sessionExpires = Date.now() + 30 * 60000;
      if (!recipient.signedAt) recipient.verifiedAt = new Date().toISOString();
      audit(current, 'email-verified', recipient.email, ip);
      return { session };
    });
    if ('error' in result) throw new BadRequestException(result.error);
    return result;
  }
  async signerDocument(token: string, session: string) {
    if (!session) throw new ForbiddenException('Verify your email first');
    const { e, r } = await this.byToken(token);
    this.requirePublic(e, r.id, token, session);
    return {
      ...publicEnvelope(e),
      recipientId: r.id,
      fields: e.fields.filter((f) => f.recipientId === r.id),
    };
  }
  async signerPdf(token: string, session: string, signed = false) {
    const metadata = await this.signerDocument(token, session);
    const { e } = await this.byToken(token);
    if (signed && metadata.status !== 'COMPLETED')
      throw new BadRequestException('All signatories must sign first');
    return readFile(this.file(e, signed ? e.signedFile! : e.originalFile));
  }
  async sign(token: string, session: string, raw: unknown, ip: string) {
    if (!session) throw new ForbiddenException('Verify your email first');
    const input = object(raw);
    if (input.consent !== true)
      throw new BadRequestException(
        'Accept electronic signing before continuing',
      );
    const { e, r } = await this.byToken(token);
    const result = await this.mutate(e.id, async (current) => {
      const recipient = this.requirePublic(current, r.id, token, session);
      if (recipient.signedAt)
        return {
          completed: current.status === 'COMPLETED',
          alreadySigned: true,
        };
      if (current.status !== 'SENT')
        throw new BadRequestException('Document cannot be signed');
      recipient.values = signingValues(
        input.values,
        current.fields.filter((f) => f.recipientId === recipient.id),
      );
      // Validate all PNGs before recording a signature, even if this is not the last signer.
      for (const value of Object.values(recipient.values))
        if (value.image) {
          const probe = await PDFDocument.create();
          try {
            const image = await probe.embedPng(
              Buffer.from(value.image.split(',')[1], 'base64'),
            );
            if (image.width > 3000 || image.height > 1500) throw new Error();
          } catch {
            throw new BadRequestException('Invalid signature image');
          }
        }
      recipient.signedAt = new Date().toISOString();
      audit(
        current,
        'consent-and-signature',
        recipient.email,
        ip,
        'Accepted electronic signing and the displayed document',
      );
      const completed = current.recipients.every(
        (recipient) => recipient.signedAt,
      );
      if (completed) {
        current.completedAt = new Date().toISOString();
        const original = await readFile(
          this.file(current, current.originalFile),
        );
        if (digest(original) !== current.originalHash)
          throw new BadRequestException(
            'Source document integrity check failed',
          );
        const bytes = await this.pdf.signed(original, current);
        const filename = `signed-${randomUUID()}.pdf`;
        await writeFile(this.file(current, filename), bytes, {
          mode: 0o600,
          flag: 'wx',
        });
        current.signedFile = filename;
        current.signedHash = digest(bytes);
        current.status = 'COMPLETED';
        audit(current, 'completed', 'o7', undefined, current.signedHash);
      }
      return { completed, alreadySigned: false };
    });
    if (result.completed && !result.alreadySigned) await this.completion(e.id);
    return result;
  }
  private async completion(id: string) {
    const rows = await this.prisma.$queryRaw<
      Stored[]
    >`SELECT "data" FROM "SignatureEnvelope" WHERE "id"=${id}`;
    const e = rows[0].data;
    const pdf = await readFile(this.file(e, e.signedFile!));
    let failed = false;
    await Promise.all(
      [...new Set([e.ownerEmail, ...e.recipients.map((r) => r.email)])].map(
        async (address) => {
          try {
            await this.mail.send(
              e.tenantId,
              address,
              `o7 · ${e.title} · ${e.language === 'fr' ? 'Signé' : e.language === 'es' ? 'Firmado' : 'Signed'}`,
              `${e.title}\n\n${e.language === 'fr' ? 'Le document a été signé par tous les destinataires. Le PDF signé est joint.' : e.language === 'es' ? 'Todos los destinatarios han firmado el documento. Se adjunta el PDF firmado.' : 'All recipients have signed. The signed PDF is attached.'}\n\nSHA-256: ${e.signedHash}`,
              pdf,
            );
          } catch {
            failed = true;
          }
        },
      ),
    );
    await this.mutate(id, (current) => {
      current.completionDelivery = failed ? 'FAILED' : 'SENT';
      audit(
        current,
        failed ? 'completion-mail-failed' : 'completion-mail-accepted',
        'o7',
      );
    });
  }
  async resendCompleted(id: string, user: RequestUser) {
    const e = await this.owned(id, user);
    if (e.status !== 'COMPLETED')
      throw new BadRequestException('Document is not completed');
    await this.mail.ready(user.tenantId);
    await this.completion(id);
    return this.get(id, user);
  }
}
