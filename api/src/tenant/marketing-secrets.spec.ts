import { transformMarketingSecrets } from './marketing-secrets';
describe('marketing encryption', () => {
  const original = process.env.MARKETING_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.MARKETING_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString(
      'base64',
    );
  });
  afterEach(() => {
    if (original === undefined) delete process.env.MARKETING_ENCRYPTION_KEY;
    else process.env.MARKETING_ENCRYPTION_KEY = original;
  });
  it('encrypts every provider with fresh nonces and reads legacy plaintext', () => {
    const setup = {
      smtp: { password: 'smtp-secret' },
      mailchimp: { apiKey: 'mailchimp-secret' },
      brevo: { apiKey: 'brevo-secret' },
      buffer: { apiKey: 'buffer-secret' },
    };
    const encrypted = transformMarketingSecrets(setup, true);
    expect(JSON.stringify(encrypted)).not.toContain('-secret');
    expect(transformMarketingSecrets(encrypted, false)).toEqual(setup);
    expect(transformMarketingSecrets(setup, false)).toEqual(setup);
    expect(transformMarketingSecrets(setup, true)).not.toEqual(encrypted);
  });
  it('fails closed on missing keys, tampering and credential substitution', () => {
    const encrypted = transformMarketingSecrets(
      { smtp: { password: 'secret' } },
      true,
    );
    expect(() =>
      transformMarketingSecrets(
        { buffer: { apiKey: encrypted.smtp.password } },
        false,
      ),
    ).toThrow();
    process.env.MARKETING_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString(
      'base64',
    );
    expect(() => transformMarketingSecrets(encrypted, false)).toThrow();
    delete process.env.MARKETING_ENCRYPTION_KEY;
    expect(() =>
      transformMarketingSecrets({ smtp: { password: 'secret' } }, true),
    ).toThrow('MARKETING_ENCRYPTION_KEY');
  });
});
