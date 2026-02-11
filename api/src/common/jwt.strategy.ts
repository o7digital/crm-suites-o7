import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

export interface JwtPayload {
  sub: string;
  tenantId?: string;
  tenant_id?: string;
  email?: string;
  user_metadata?: Record<string, any>;
  [key: string]: any;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: async (_request, rawJwtToken, done) => {
        try {
          const decoded = jwt.decode(rawJwtToken, { complete: true }) as
            | { header?: Record<string, unknown>; payload?: Record<string, unknown> }
            | null;
          if (!decoded || !decoded.header) {
            return done(new Error('Invalid JWT'), undefined);
          }

          const alg = decoded.header.alg as string | undefined;
          const kid = decoded.header.kid as string | undefined;
          const iss = (decoded.payload as Record<string, unknown> | undefined)?.iss as string | undefined;

          if (process.env.JWT_DEBUG === 'true') {
            // eslint-disable-next-line no-console
            console.log('[auth] jwt header', { alg, kid, iss });
          }
          if (alg && alg.startsWith('HS')) {
            const allowedHsAlgs = ['HS256', 'HS384', 'HS512'] as const;
            if (!allowedHsAlgs.includes(alg as (typeof allowedHsAlgs)[number])) {
              return done(new Error(`Unsupported HS alg: ${alg}`), undefined);
            }
            const algorithm = alg as jwt.Algorithm;
            const secret =
              configService.get<string>('SUPABASE_JWT_SECRET') ||
              configService.get<string>('JWT_SECRET') ||
              'dev-secret';

            const candidates: Array<string | Buffer> = [secret];
            // If the secret looks base64-ish, also try decoded bytes.
            if (secret.endsWith('=') || /^[A-Za-z0-9+/]+={0,2}$/.test(secret)) {
              try {
                candidates.push(Buffer.from(secret, 'base64'));
              } catch {
                // ignore decode errors
              }
            }

            let lastErr: Error | null = null;
            for (const candidate of candidates) {
              try {
                jwt.verify(rawJwtToken, candidate, { algorithms: [algorithm] });
                if (process.env.JWT_DEBUG === 'true') {
                  // eslint-disable-next-line no-console
                  console.log('[auth] jwt hs verify ok', {
                    using: candidate instanceof Buffer ? 'base64-decoded' : 'raw',
                  });
                }
                return done(null, candidate);
              } catch (err) {
                lastErr = err as Error;
              }
            }

            if (process.env.JWT_DEBUG === 'true' && lastErr) {
              // eslint-disable-next-line no-console
              console.log('[auth] jwt hs verify failed', { message: lastErr.message });
            }
            return done(lastErr ?? new Error('JWT HS verification failed'), undefined);
          }

          const payload = decoded.payload || {};
          const issuer = payload.iss as string | undefined;
          if (!issuer) {
            return done(new Error('JWT issuer missing'), undefined);
          }

          if (!kid) {
            return done(new Error('JWT kid missing'), undefined);
          }

          const jwksUri = `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`;
          const client = getJwksClient(jwksUri);
          const key = await client.getSigningKey(kid);
          const signingKey = key.getPublicKey();
          return done(null, signingKey);
        } catch (err) {
          return done(err as Error, undefined);
        }
      },
    });
  }

  async validate(payload: JwtPayload) {
    const tenantId = payload.tenant_id || payload.tenantId || payload.sub;
    const name =
      (payload.user_metadata && payload.user_metadata.name) ||
      payload.name ||
      payload.email ||
      'User';
    const tenantName = payload.user_metadata?.tenant_name;
    const inviteToken = payload.user_metadata?.invite_token;
    return { userId: payload.sub, tenantId, email: payload.email, name, tenantName, inviteToken };
  }
}

const jwksClients = new Map<string, jwksRsa.JwksClient>();

function getJwksClient(jwksUri: string) {
  const existing = jwksClients.get(jwksUri);
  if (existing) return existing;
  const client = jwksRsa({
    jwksUri,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 10 * 60 * 1000,
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  });
  jwksClients.set(jwksUri, client);
  return client;
}
