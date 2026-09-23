import { jwtProfile } from './jwt-policy';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(configService: ConfigService, private prisma: PrismaService) {
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

          const alg = String(decoded.header.alg || '');
          const profile = jwtProfile(configService, decoded.payload?.iss, alg);
          const options: jwt.VerifyOptions = {
            algorithms: [alg as jwt.Algorithm], issuer: profile.issuer, audience: profile.audience,
          };
          if (alg === 'HS256') {
            jwt.verify(rawJwtToken, profile.secret!, options);
            return done(null, profile.secret);
          }
          const kid = decoded.header.kid;
          if (typeof kid !== 'string' || !kid) throw new Error('JWT kid missing');
          const issuerUrl = new URL(profile.issuer!);
          if (issuerUrl.protocol !== 'https:') throw new Error('JWT issuer must use HTTPS');
          const base = profile.issuer!.replace(/\/$/, '');
          const jwksUri = `${base}/.well-known/jwks.json`;
          const key = await getJwksClient(jwksUri).getSigningKey(kid);
          const signingKey = key.getPublicKey();
          jwt.verify(rawJwtToken, signingKey, options);
          return done(null, signingKey);
        } catch (err) {
          return done(err as Error, undefined);
        }
      },
    });
  }

  async validate(payload: JwtPayload) {
    if (typeof payload.sub !== 'string' || !payload.sub) throw new ForbiddenException('JWT subject missing');
    const membership = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { tenantId: true } });
    const requestedTenant =
      payload.tenant_id ||
      payload.tenantId ||
      payload.user_metadata?.tenant_id ||
      payload.user_metadata?.tenantId ||
      payload.sub;
    if (typeof requestedTenant !== 'string') throw new ForbiddenException('Invalid workspace claim');
    const tenantId = membership?.tenantId || requestedTenant;
    if (!membership) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
      if (tenant) {
        const inviteToken = payload.user_metadata?.invite_token || payload.user_metadata?.inviteToken;
        const invitation = payload.email ? await this.prisma.userInvite.findFirst({ where: {
          tenantId, status: 'PENDING', email: { equals: payload.email.trim(), mode: 'insensitive' },
          ...(typeof inviteToken === 'string' ? { token: inviteToken } : {}),
        }, select: { id: true } }) : null;
        if (!invitation) throw new ForbiddenException('Workspace membership or invitation required');
      }
    }

    try {
      const customerSubscription = await this.prisma.subscription.findFirst({
        where: { customerTenantId: tenantId },
        select: { status: true },
        orderBy: { createdAt: 'desc' },
      });
      if (customerSubscription && customerSubscription.status !== 'ACTIVE') {
        if (customerSubscription.status === 'PAUSED') {
          throw new ForbiddenException('Account is suspended for this workspace.');
        }
        throw new ForbiddenException('Subscription is not active for this workspace.');
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || (err.code !== 'P2021' && err.code !== 'P2022')) {
        throw err;
      }
    }

    const name =
      (payload.user_metadata && payload.user_metadata.name) ||
      payload.name ||
      payload.email ||
      'User';
    const tenantName = payload.user_metadata?.tenant_name || payload.user_metadata?.tenantName;
    const inviteToken = payload.user_metadata?.invite_token || payload.user_metadata?.inviteToken;
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
