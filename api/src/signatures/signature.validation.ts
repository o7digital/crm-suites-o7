import { BadRequestException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import type {
  SignatureEnvelope,
  SignatureField,
  SignatureValue,
} from './signature.types';
export const digest = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('hex');
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid request');
  return value as Record<string, unknown>;
}
export function text(value: unknown, max: number, required = true): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new BadRequestException(
      `Text is required (maximum ${max} characters)`,
    );
  return value.trim();
}
export function email(value: unknown) {
  const result = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    throw new BadRequestException('Invalid email address');
  return result;
}
export function fields(
  value: unknown,
  envelope: SignatureEnvelope,
): SignatureField[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new BadRequestException('Maximum 100 fields');
  const ids = new Set<string>();
  return value.map((raw) => {
    const f = object(raw);
    const id = text(f.id, 100);
    if (ids.has(id)) throw new BadRequestException('Duplicate field');
    ids.add(id);
    if (!['signature', 'initials', 'date', 'text'].includes(String(f.type)))
      throw new BadRequestException('Invalid field type');
    const page = Number(f.page);
    if (!Number.isInteger(page) || page < 1 || page > envelope.pages)
      throw new BadRequestException('Invalid page');
    const x = Number(f.x),
      y = Number(f.y),
      width = Number(f.width),
      height = Number(f.height);
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      width < 0.04 ||
      height < 0.015 ||
      x + width > 1.001 ||
      y + height > 1.001
    )
      throw new BadRequestException('Field must fit on the PDF page');
    const recipientId = text(f.recipientId, 100);
    if (!envelope.recipients.some((r) => r.id === recipientId))
      throw new BadRequestException('Unknown signatory');
    return {
      id,
      page,
      x,
      y,
      width,
      height,
      recipientId,
      type: f.type as SignatureField['type'],
      label: typeof f.label === 'string' ? text(f.label, 120, false) : '',
      required: f.required !== false,
      ...(f.type === 'text' && typeof f.preset === 'string'
        ? { preset: text(f.preset, 300, false) }
        : {}),
    };
  });
}
export function signingValues(
  value: unknown,
  assigned: SignatureField[],
): Record<string, SignatureValue> {
  const input = object(value);
  const result: Record<string, SignatureValue> = {};
  for (const f of assigned) {
    if (f.type === 'date' || f.preset !== undefined) continue;
    const raw = input[f.id];
    if (!raw) {
      if (f.required)
        throw new BadRequestException(`Complete field: ${f.label || f.type}`);
      continue;
    }
    const v = object(raw);
    if (typeof v.image === 'string' && f.type === 'signature') {
      if (
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.image) ||
        v.image.length > 500000
      )
        throw new BadRequestException('Invalid handwritten signature');
      result[f.id] = { image: v.image };
    } else {
      const content = text(
        v.text,
        f.type === 'initials' ? 12 : 300,
        f.required,
      );
      if (f.type === 'initials' && content && !/^[\p{L}]+$/u.test(content))
        throw new BadRequestException('Initials must contain letters only');
      if (content) result[f.id] = { text: content };
    }
  }
  if (Object.keys(input).some((id) => !assigned.some((f) => f.id === id)))
    throw new BadRequestException('Cannot sign another signatory’s fields');
  return result;
}
// PostgreSQL JSONB can reorder keys; audit hashes must use a canonical order.
export const auditDigest = (entry: Record<string, unknown>) =>
  digest(JSON.stringify(entry, Object.keys(entry).sort()));

export function audit(
  envelope: SignatureEnvelope,
  event: string,
  actor: string,
  ip?: string,
  detail?: string,
) {
  const previous = envelope.audit.at(-1)?.hash || envelope.originalHash;
  const entry = {
    at: new Date().toISOString(),
    event,
    actor,
    ...(ip ? { ip: ip.slice(0, 100) } : {}),
    ...(detail ? { detail: detail.slice(0, 500) } : {}),
    previous,
  };
  envelope.audit.push({ ...entry, hash: auditDigest(entry) });
}
export function publicEnvelope(e: SignatureEnvelope) {
  return {
    id: e.id,
    title: e.title,
    tenantName: e.tenantName,
    status: e.status,
    createdAt: e.createdAt,
    sentAt: e.sentAt,
    completedAt: e.completedAt,
    expiresAt: e.expiresAt,
    pages: e.pages,
    pageSizes: e.pageSizes,
    originalHash: e.originalHash,
    signedHash: e.signedHash,
    fields: e.fields,
    recipients: e.recipients.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      signedAt: r.signedAt,
      verifiedAt: r.verifiedAt,
      delivery: r.delivery,
      deliveryError: r.deliveryError,
    })),
    completionDelivery: e.completionDelivery,
    language: e.language,
  };
}
