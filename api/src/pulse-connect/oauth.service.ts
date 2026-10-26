import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { connectConfig, SCOPES } from './config';

export const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
function stringParams(value: unknown): asserts value is Record<string, string> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.values(value).some((v) => typeof v !== 'string' || v.length > 4096)
  ) {
    throw new BadRequestException({ error: 'invalid_request' });
  }
}
const invalid = () => new BadRequestException({ error: 'invalid_grant' });
export type Connection = {
  grantId: string;
  scopes: string[];
  timeZone: string;
  user: RequestUser;
};

@Injectable()
export class PulseOAuthService {
  constructor(private readonly db: PrismaService) {}

  metadata() {
    const c = connectConfig();
    return {
      issuer: c.origin,
      authorization_endpoint: `${c.origin}/api/oauth/authorize`,
      token_endpoint: `${c.origin}/api/oauth/token`,
      revocation_endpoint: `${c.origin}/api/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: SCOPES,
      authorization_response_iss_parameter_supported: true,
    };
  }
  protectedMetadata() {
    const c = connectConfig();
    return {
      resource: c.resource,
      authorization_servers: [c.origin],
      scopes_supported: ['pulse:read', 'pulse:write'],
      bearer_methods_supported: ['header'],
    };
  }
  async begin(q: Record<string, string>) {
    stringParams(q);
    const c = connectConfig();
    if (
      q.client_id !== c.clientId ||
      !c.redirects.includes(q.redirect_uri) ||
      q.resource !== c.resource ||
      q.response_type !== 'code' ||
      q.code_challenge_method !== 'S256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge || '') ||
      !q.state ||
      q.state.length > 2048
    ) {
      throw new BadRequestException({ error: 'invalid_request' });
    }
    const scopes = [...new Set((q.scope || 'pulse:read').split(' '))];
    if (
      scopes.some((s) => !SCOPES.includes(s)) ||
      !scopes.includes('pulse:read')
    )
      throw new BadRequestException({ error: 'invalid_scope' });
    const request = await this.db.pulseOAuthRequest.create({
      data: {
        clientId: c.clientId,
        redirectUri: q.redirect_uri,
        resource: c.resource,
        challenge: q.code_challenge,
        scopes,
        state: q.state,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    return `${c.frontend}/connect/pulse?request=${request.id}`;
  }
  private async pending(id: string) {
    connectConfig();
    const r = await this.db.pulseOAuthRequest.findUnique({ where: { id } });
    if (!r || r.consumedAt || r.expiresAt < new Date()) throw invalid();
    return r;
  }
  async preview(id: string, user: RequestUser) {
    const r = await this.pending(id);
    const u = await this.member(user.userId, user.tenantId);
    return {
      client: 'ChatGPT',
      scopes: r.scopes,
      email: u.email,
      workspace: u.tenant.name,
      timeZone: null,
    };
  }
  async consent(
    id: string,
    body: { allow: boolean; write?: boolean; timeZone?: string },
    user: RequestUser,
  ) {
    const c = connectConfig();
    if (user.supportImpersonation)
      throw new ForbiddenException('Sign in with your own Pulse account');
    const r = await this.pending(id);
    await this.member(user.userId, user.tenantId);
    if (!body || typeof body.allow !== 'boolean')
      throw new BadRequestException('Explicit consent required');
    if (body.allow) {
      if (typeof body.timeZone !== 'string' || body.timeZone.length > 100)
        throw new BadRequestException('Confirm an IANA time zone');
      try {
        new Intl.DateTimeFormat('en', { timeZone: body.timeZone }).format();
      } catch {
        throw new BadRequestException('Invalid IANA time zone');
      }
    }
    const code = secret();
    await this.db.$transaction(async (tx) => {
      const used = await tx.pulseOAuthRequest.updateMany({
        where: { id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (used.count !== 1) throw invalid();
      if (!body.allow) return;
      const grant = await tx.pulseOAuthGrant.create({
        data: {
          clientId: r.clientId,
          userId: user.userId,
          tenantId: user.tenantId,
          scopes: r.scopes.filter(
            (s) => s !== 'pulse:write' || body.write === true,
          ),
          timeZone: body.timeZone!,
        },
      });
      await tx.pulseOAuthCode.create({
        data: {
          hash: hash(code),
          grantId: grant.id,
          challenge: r.challenge,
          redirectUri: r.redirectUri,
          resource: r.resource,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
    });
    const url = new URL(r.redirectUri);
    url.searchParams.set('state', r.state);
    url.searchParams.set('iss', c.origin);
    url.searchParams.set(
      body.allow ? 'code' : 'error',
      body.allow ? code : 'access_denied',
    );
    return { redirect: url.toString() };
  }
  async exchange(b: Record<string, string>) {
    stringParams(b);
    const c = connectConfig();
    if (b.client_id !== c.clientId || b.resource !== c.resource)
      throw invalid();
    const access = secret(),
      refresh = secret();
    // Return a tagged outcome so refresh-token replay revocation commits before the error response.
    const outcome = await this.db.$transaction(async (tx) => {
      let grantId: string;
      if (b.grant_type === 'authorization_code') {
        if (!/^[A-Za-z0-9._~-]{43,128}$/.test(b.code_verifier || '') || !b.code)
          throw invalid();
        const code = await tx.pulseOAuthCode.findUnique({
          where: { hash: hash(b.code) },
        });
        const challenge = createHash('sha256')
          .update(b.code_verifier)
          .digest('base64url');
        if (
          !code ||
          code.usedAt ||
          code.expiresAt < new Date() ||
          code.redirectUri !== b.redirect_uri ||
          code.resource !== c.resource ||
          code.challenge !== challenge
        )
          throw invalid();
        const consumed = await tx.pulseOAuthCode.updateMany({
          where: { hash: code.hash, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) throw invalid();
        grantId = code.grantId;
      } else if (b.grant_type === 'refresh_token' && b.refresh_token) {
        const token = await tx.pulseOAuthToken.findUnique({
          where: { hash: hash(b.refresh_token) },
        });
        if (
          !token ||
          token.kind !== 'refresh' ||
          token.resource !== c.resource ||
          token.expiresAt < new Date()
        )
          throw invalid();
        const consumed = await tx.pulseOAuthToken.updateMany({
          where: { hash: token.hash, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) {
          await tx.pulseOAuthGrant.update({
            where: { id: token.grantId },
            data: { revokedAt: new Date() },
          });
          return null;
        }
        grantId = token.grantId;
      } else throw new BadRequestException({ error: 'unsupported_grant_type' });
      const grant = await tx.pulseOAuthGrant.findUnique({
        where: { id: grantId },
      });
      if (!grant || grant.revokedAt || grant.clientId !== c.clientId)
        throw invalid();
      await this.member(grant.userId, grant.tenantId);
      await tx.pulseOAuthToken.create({
        data: {
          hash: hash(access),
          grantId,
          kind: 'access',
          resource: c.resource,
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      });
      if (grant.scopes.includes('offline_access'))
        await tx.pulseOAuthToken.create({
          data: {
            hash: hash(refresh),
            grantId,
            kind: 'refresh',
            resource: c.resource,
            expiresAt: new Date(Date.now() + 30 * 86400_000),
          },
        });
      return grant;
    });
    if (!outcome) throw invalid();
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: 900,
      scope: outcome.scopes.join(' '),
      ...(outcome.scopes.includes('offline_access')
        ? { refresh_token: refresh }
        : {}),
    };
  }
  async authenticate(authorization?: string): Promise<Connection> {
    const c = connectConfig();
    const raw = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!raw) throw new UnauthorizedException('OAuth bearer token required');
    const token = await this.db.pulseOAuthToken.findUnique({
      where: { hash: hash(raw) },
      include: { grant: true },
    });
    if (
      !token ||
      token.kind !== 'access' ||
      token.usedAt ||
      token.expiresAt < new Date() ||
      token.resource !== c.resource ||
      token.grant.revokedAt
    )
      throw new UnauthorizedException('Invalid or revoked OAuth token');
    const g = token.grant;
    const member = await this.member(g.userId, g.tenantId);
    return {
      grantId: g.id,
      scopes: g.scopes,
      timeZone: g.timeZone,
      user: {
        userId: member.id,
        tenantId: member.tenantId,
        email: member.email,
      },
    };
  }
  async member(userId: string, tenantId: string) {
    const member = await this.db.user.findFirst({
      where: { id: userId, tenantId },
      include: { tenant: true },
    });
    if (!member)
      throw new ForbiddenException('Active workspace membership required');
    const subscription = await this.db.subscription.findUnique({
      where: { customerTenantId: tenantId },
      select: { status: true },
    });
    if (subscription && subscription.status !== 'ACTIVE')
      throw new ForbiddenException('Workspace subscription is not active');
    return member;
  }
  async revokeToken(b: Record<string, string>) {
    stringParams(b);
    const c = connectConfig();
    if (b.client_id !== c.clientId)
      throw new BadRequestException({ error: 'invalid_client' });
    const token =
      b.token &&
      (await this.db.pulseOAuthToken.findUnique({
        where: { hash: hash(b.token) },
      }));
    if (token)
      await this.db.pulseOAuthGrant.updateMany({
        where: { id: token.grantId, clientId: c.clientId },
        data: { revokedAt: new Date() },
      });
    return {};
  }
  async connections(user: RequestUser) {
    connectConfig();
    await this.member(user.userId, user.tenantId);
    return this.db.pulseOAuthGrant.findMany({
      where: { userId: user.userId, tenantId: user.tenantId },
      select: {
        id: true,
        scopes: true,
        timeZone: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  async revokeConnection(id: string, user: RequestUser) {
    connectConfig();
    await this.member(user.userId, user.tenantId);
    await this.db.pulseOAuthGrant.updateMany({
      where: { id, userId: user.userId, tenantId: user.tenantId },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }
}
