import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const prefix = 'enc:v1:';
const fields = [
  ['smtp', 'password'],
  ['mailchimp', 'apiKey'],
  ['brevo', 'apiKey'],
  ['buffer', 'apiKey'],
] as const;
function key() {
  const raw = process.env.MARKETING_ENCRYPTION_KEY || '';
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length !== 32 || bytes.toString('base64') !== raw)
    throw new Error(
      'MARKETING_ENCRYPTION_KEY must be a base64-encoded random 32-byte key',
    );
  return bytes;
}
export function transformMarketingSecrets(raw: unknown, encrypt: boolean): any {
  if (!raw || typeof raw !== 'object') return raw;
  const setup = JSON.parse(JSON.stringify(raw));
  for (const [provider, field] of fields) {
    const value = setup[provider]?.[field];
    if (typeof value !== 'string' || !value) continue;
    if (encrypt) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key(), iv);
      cipher.setAAD(Buffer.from(`pulse:marketing:${provider}:${field}`));
      const ciphertext = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final(),
      ]);
      setup[provider][field] =
        prefix +
        [iv, cipher.getAuthTag(), ciphertext]
          .map((v) => v.toString('base64'))
          .join(':');
    } else if (value.startsWith(prefix)) {
      const [iv, tag, ciphertext, extra] = value
        .slice(prefix.length)
        .split(':');
      if (!iv || !tag || !ciphertext || extra)
        throw new Error('Invalid encrypted marketing credential');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key(),
        Buffer.from(iv, 'base64'),
      );
      decipher.setAAD(Buffer.from(`pulse:marketing:${provider}:${field}`));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      setup[provider][field] = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    }
  }
  return setup;
}
