import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

function keyFor(token: string, config: Record<string, string> = {}) {
  const strategy = new JwtStrategy({ get: (key: string) => config[key] } as ConfigService, {} as PrismaService);
  return new Promise((resolve, reject) => {
    (strategy as any)._secretOrKeyProvider({}, token, (error: Error | null, key: unknown) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function untrustedToken(issuer: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', kid: 'attacker-key' })}.${encode({ sub: 'attacker', iss: issuer })}.invalid`;
}

describe('JWT key selection', () => {
  it('rejects asymmetric tokens when no trusted issuer is configured', async () => {
    await expect(keyFor(untrustedToken('http://127.0.0.1'))).rejects.toThrow('JWT issuer not allowed');
  });

  it('rejects a different issuer before requesting its signing keys', async () => {
    await expect(keyFor(untrustedToken('https://attacker.example'), {
      CLERK_JWT_ISSUER: 'https://trusted.example',
    })).rejects.toThrow('JWT issuer not allowed');
  });

  it('rejects the development fallback and short secrets in production', async () => {
    const token = jwt.sign({ sub: 'attacker' }, 'dev-secret');
    await expect(keyFor(token, { NODE_ENV: 'production' })).rejects.toThrow('strong JWT secret');
    await expect(keyFor(token, { NODE_ENV: 'production', JWT_SECRET: 'short' })).rejects.toThrow('strong JWT secret');
  });

  it('accepts valid HMAC tokens with a configured strong secret and rejects expired tokens', async () => {
    const secret = 'a-strong-test-secret-with-at-least-32-bytes';
    const config = { NODE_ENV: 'production', JWT_SECRET: secret };
    await expect(keyFor(jwt.sign({ sub: 'u1' }, secret), config)).resolves.toBe(secret);
    await expect(keyFor(jwt.sign({ sub: 'u1' }, secret, { expiresIn: -1 }), config)).rejects.toThrow();
  });
});
