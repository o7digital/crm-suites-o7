import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/user.decorator';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar'] as const;
const CALLBACK_TTL_MS = 10 * 60 * 1000;

const TASK_SYNC_INCLUDE = {
  client: {
    select: {
      firstName: true,
      name: true,
      email: true,
    },
  },
} as const;

type TaskForCalendar = Prisma.TaskGetPayload<{ include: typeof TASK_SYNC_INCLUDE }>;

type CallbackState = {
  v: 1;
  userId: string;
  tenantId: string;
  redirectTo: string;
  redirectUri: string;
  issuedAt: number;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfoResponse = {
  email?: string;
};

@Injectable()
export class GoogleCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getStatus(user: RequestUser, requestOrigin?: string) {
    await this.ensureAdmin(user);
    const connection = await this.prisma.googleCalendarConnection.findUnique({
      where: { userId: user.userId },
      select: {
        googleEmail: true,
        calendarId: true,
        calendarSummary: true,
        lastSyncAt: true,
        lastSyncError: true,
        updatedAt: true,
      },
    });

    return {
      configReady: this.hasGoogleConfig(),
      connected: Boolean(connection),
      crmUserEmail: user.email || '',
      googleEmail: connection?.googleEmail || '',
      calendarId: connection?.calendarId || 'primary',
      calendarSummary: connection?.calendarSummary || 'Primary calendar',
      lastSyncAt: connection?.lastSyncAt || null,
      lastSyncError: connection?.lastSyncError || null,
      updatedAt: connection?.updatedAt || null,
      callbackUrlHint: `${stripTrailingSlash(requestOrigin || this.defaultApiOrigin())}/api/admin/google-calendar/callback`,
    };
  }

  async createConnectUrl(user: RequestUser, redirectTo: string | undefined, requestOrigin: string) {
    await this.ensureAdmin(user);
    const config = this.googleConfig();

    const redirectUri = `${stripTrailingSlash(requestOrigin)}/api/admin/google-calendar/callback`;
    const target = this.normalizeRedirectUrl(redirectTo) || this.defaultFrontendAdminUrl();
    const state = this.signState({
      v: 1,
      userId: user.userId,
      tenantId: user.tenantId,
      redirectTo: target,
      redirectUri,
      issuedAt: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: GOOGLE_SCOPES.join(' '),
      state,
    });

    return { url: `${GOOGLE_AUTH_URL}?${params.toString()}` };
  }

  async handleOAuthCallback(params: { code?: string; state?: string; error?: string }) {
    const claims = this.verifyState(params.state);
    if (params.error) {
      return this.buildRedirectUrl(claims.redirectTo, 'error', `google_${params.error}`);
    }
    if (!params.code) {
      return this.buildRedirectUrl(claims.redirectTo, 'error', 'missing_authorization_code');
    }

    const tokens = await this.exchangeCodeForTokens(params.code, claims.redirectUri);
    const accessToken = (tokens.access_token || '').trim();
    if (!accessToken) {
      return this.buildRedirectUrl(claims.redirectTo, 'error', 'google_missing_access_token');
    }

    const googleEmail = await this.fetchGoogleEmail(accessToken);
    if (!googleEmail) {
      return this.buildRedirectUrl(claims.redirectTo, 'error', 'google_missing_email');
    }

    const existing = await this.prisma.googleCalendarConnection.findUnique({
      where: { userId: claims.userId },
      select: {
        id: true,
        refreshTokenCipher: true,
        calendarId: true,
        calendarSummary: true,
      },
    });

    const refreshToken =
      (tokens.refresh_token || '').trim() ||
      (existing?.refreshTokenCipher ? this.decrypt(existing.refreshTokenCipher) : '');
    if (!refreshToken) {
      return this.buildRedirectUrl(claims.redirectTo, 'error', 'google_missing_refresh_token');
    }

    const connection = await this.prisma.googleCalendarConnection.upsert({
      where: { userId: claims.userId },
      update: {
        tenantId: claims.tenantId,
        googleEmail,
        refreshTokenCipher: this.encrypt(refreshToken),
        calendarId: existing?.calendarId || 'primary',
        calendarSummary: existing?.calendarSummary || 'Primary calendar',
        lastSyncError: null,
      },
      create: {
        tenantId: claims.tenantId,
        userId: claims.userId,
        googleEmail,
        refreshTokenCipher: this.encrypt(refreshToken),
        calendarId: 'primary',
        calendarSummary: 'Primary calendar',
      },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        googleEmail: true,
        refreshTokenCipher: true,
        calendarId: true,
        calendarSummary: true,
      },
    });

    try {
      await this.syncAllTasksForConnection(connection.id);
    } catch {
      // Keep the connection active even if the first sync partially fails.
    }

    return this.buildRedirectUrl(claims.redirectTo, 'connected');
  }

  buildErrorRedirectFromState(state: string | undefined, err: unknown) {
    const target = this.tryReadRedirectFromState(state) || this.defaultFrontendAdminUrl();
    return this.buildRedirectUrl(target, 'error', toErrorMessage(err));
  }

  async disconnect(user: RequestUser) {
    await this.ensureAdmin(user);
    const connection = await this.prisma.googleCalendarConnection.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });
    if (!connection) {
      return { disconnected: true, connected: false };
    }

    await this.prisma.googleCalendarConnection.delete({
      where: { userId: user.userId },
    });

    return { disconnected: true, connected: false };
  }

  async syncNow(user: RequestUser) {
    await this.ensureAdmin(user);
    const connection = await this.prisma.googleCalendarConnection.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });
    if (!connection) {
      throw new NotFoundException('Google Calendar is not connected for this admin account');
    }

    await this.syncAllTasksForConnection(connection.id);
    return this.getStatus(user);
  }

  async syncTaskChange(task: TaskForCalendar) {
    const connections = await this.prisma.googleCalendarConnection.findMany({
      where: { tenantId: task.tenantId },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        googleEmail: true,
        refreshTokenCipher: true,
        calendarId: true,
        calendarSummary: true,
      },
    });

    for (const connection of connections) {
      try {
        const accessToken = await this.getAccessToken(connection.refreshTokenCipher);
        if (!task.dueDate) {
          await this.deleteGoogleEvent(connection.calendarId, this.googleEventId(connection.userId, task.id), accessToken);
        } else {
          await this.upsertGoogleEvent(connection.calendarId, task, connection.userId, accessToken);
        }
        await this.markSyncSuccess(connection.id);
      } catch (err) {
        await this.markSyncFailure(connection.id, err);
        console.warn('[google-calendar] task sync failed', {
          taskId: task.id,
          connectionId: connection.id,
          message: toErrorMessage(err),
        });
      }
    }
  }

  async removeTaskFromCalendars(taskId: string, tenantId: string) {
    const connections = await this.prisma.googleCalendarConnection.findMany({
      where: { tenantId },
      select: {
        id: true,
        userId: true,
        refreshTokenCipher: true,
        calendarId: true,
      },
    });

    for (const connection of connections) {
      try {
        const accessToken = await this.getAccessToken(connection.refreshTokenCipher);
        await this.deleteGoogleEvent(connection.calendarId, this.googleEventId(connection.userId, taskId), accessToken);
        await this.markSyncSuccess(connection.id);
      } catch (err) {
        await this.markSyncFailure(connection.id, err);
        console.warn('[google-calendar] task delete sync failed', {
          taskId,
          connectionId: connection.id,
          message: toErrorMessage(err),
        });
      }
    }
  }

  private async syncAllTasksForConnection(connectionId: string) {
    const connection = await this.prisma.googleCalendarConnection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        refreshTokenCipher: true,
        calendarId: true,
      },
    });
    if (!connection) throw new NotFoundException('Google Calendar connection not found');

    const accessToken = await this.getAccessToken(connection.refreshTokenCipher);
    const tasks = await this.prisma.task.findMany({
      where: { tenantId: connection.tenantId },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      include: TASK_SYNC_INCLUDE,
    });

    for (const task of tasks) {
      if (!task.dueDate) {
        await this.deleteGoogleEvent(connection.calendarId, this.googleEventId(connection.userId, task.id), accessToken);
        continue;
      }
      await this.upsertGoogleEvent(connection.calendarId, task, connection.userId, accessToken);
    }

    await this.markSyncSuccess(connection.id);
  }

  private async upsertGoogleEvent(calendarId: string, task: TaskForCalendar, userId: string, accessToken: string) {
    const eventId = this.googleEventId(userId, task.id);
    const payload = this.buildEventPayload(task, eventId);
    const updateRes = await this.googleApiFetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      accessToken,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      { allow404: true },
    );

    if (updateRes.status === 404) {
      await this.googleApiFetch(
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
    }
  }

  private async deleteGoogleEvent(calendarId: string, eventId: string, accessToken: string) {
    await this.googleApiFetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      accessToken,
      { method: 'DELETE' },
      { allow404: true },
    );
  }

  private buildEventPayload(task: TaskForCalendar, eventId: string) {
    const dueIso = task.dueDate?.toISOString().slice(0, 10);
    if (!dueIso) {
      throw new BadRequestException('Task due date is required for Google Calendar sync');
    }

    return {
      id: eventId,
      summary: task.title || 'CRM task',
      description: this.buildEventDescription(task),
      start: { date: dueIso },
      end: { date: addDaysIso(dueIso, 1) },
      extendedProperties: {
        private: {
          source: 'o7-pulsecrm',
          taskId: task.id,
          tenantId: task.tenantId,
        },
      },
    };
  }

  private buildEventDescription(task: TaskForCalendar) {
    const details = [
      'CRM task from o7 PulseCRM',
      `Status: ${task.status}`,
      task.client ? `Client: ${formatClientDisplayName(task.client)}` : '',
      task.client?.email ? `Client email: ${task.client.email}` : '',
      task.timeSpentHours ? `Hours spent: ${task.timeSpentHours.toString()}h` : '',
      task.amount ? `Amount: ${(task.currency || 'USD').toUpperCase()} ${task.amount.toString()}` : '',
    ].filter(Boolean);
    return details.join('\n');
  }

  private googleEventId(userId: string, taskId: string) {
    return `o7${createHash('sha1').update(`${userId}:${taskId}`).digest('hex').slice(0, 60)}`;
  }

  private async getAccessToken(refreshTokenCipher: string) {
    const refreshToken = this.decrypt(refreshTokenCipher);
    if (!refreshToken) {
      throw new UnauthorizedException('Missing Google refresh token');
    }

    const config = this.googleConfig();
    const payload = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as GoogleTokenResponse;

    if (!res.ok || !data.access_token) {
      throw new UnauthorizedException(data.error_description || data.error || `Google token refresh failed (${res.status})`);
    }

    return data.access_token;
  }

  private async exchangeCodeForTokens(code: string, redirectUri: string) {
    const config = this.googleConfig();
    const payload = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as GoogleTokenResponse;

    if (!res.ok) {
      throw new BadRequestException(data.error_description || data.error || `Google OAuth exchange failed (${res.status})`);
    }

    return data;
  }

  private async fetchGoogleEmail(accessToken: string) {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as GoogleUserInfoResponse;
    if (!res.ok) {
      throw new BadRequestException('Unable to read Google account profile');
    }
    return normalizeEmail(data.email);
  }

  private async googleApiFetch(
    url: string,
    accessToken: string,
    init: RequestInit,
    opts: { allow404?: boolean } = {},
  ) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      cache: 'no-store',
    });

    if (opts.allow404 && res.status === 404) {
      return res;
    }

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as
        | { error?: { message?: string } | string }
        | null;
      const message =
        typeof payload?.error === 'string'
          ? payload.error
          : payload?.error && typeof payload.error === 'object' && typeof payload.error.message === 'string'
            ? payload.error.message
            : `Google Calendar API failed (${res.status})`;
      throw new BadRequestException(message);
    }

    return res;
  }

  private async markSyncSuccess(connectionId: string) {
    await this.prisma.googleCalendarConnection.update({
      where: { id: connectionId },
      data: {
        lastSyncAt: new Date(),
        lastSyncError: null,
      },
    });
  }

  private async markSyncFailure(connectionId: string, err: unknown) {
    await this.prisma.googleCalendarConnection.update({
      where: { id: connectionId },
      data: {
        lastSyncError: toErrorMessage(err).slice(0, 1000),
      },
    });
  }

  private async ensureAdmin(user: RequestUser) {
    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { role: true },
    });
    if (!dbUser) throw new NotFoundException('User not found');
    if (dbUser.role !== 'OWNER' && dbUser.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
  }

  private hasGoogleConfig() {
    return Boolean(
      (this.configService.get<string>('GOOGLE_CLIENT_ID') || '').trim() &&
        (this.configService.get<string>('GOOGLE_CLIENT_SECRET') || '').trim(),
    );
  }

  private googleConfig() {
    const clientId = (this.configService.get<string>('GOOGLE_CLIENT_ID') || '').trim();
    const clientSecret = (this.configService.get<string>('GOOGLE_CLIENT_SECRET') || '').trim();
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('Google Calendar OAuth is not configured on the API');
    }
    return { clientId, clientSecret };
  }

  private signState(claims: CallbackState) {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac('sha256', this.signingSecret()).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  private verifyState(state: string | undefined) {
    if (!state) throw new UnauthorizedException('Missing OAuth state');
    const [payload, signature] = state.split('.');
    if (!payload || !signature) throw new UnauthorizedException('Invalid OAuth state');

    const expected = createHmac('sha256', this.signingSecret()).update(payload).digest('base64url');
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CallbackState;
    if (
      !parsed ||
      parsed.v !== 1 ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.tenantId !== 'string' ||
      typeof parsed.redirectTo !== 'string' ||
      typeof parsed.redirectUri !== 'string' ||
      typeof parsed.issuedAt !== 'number'
    ) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    if (Date.now() - parsed.issuedAt > CALLBACK_TTL_MS) {
      throw new UnauthorizedException('Expired OAuth state');
    }

    return parsed;
  }

  private tryReadRedirectFromState(state: string | undefined) {
    try {
      return this.verifyState(state).redirectTo;
    } catch {
      return '';
    }
  }

  private buildRedirectUrl(target: string, status: 'connected' | 'error', message?: string) {
    const url = new URL(target);
    url.searchParams.set('googleCalendar', status);
    if (message) url.searchParams.set('message', message);
    return url.toString();
  }

  private normalizeRedirectUrl(value: string | undefined) {
    if (!value) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      if (!this.isAllowedFrontendHost(url)) return '';
      return url.toString();
    } catch {
      return '';
    }
  }

  private defaultFrontendAdminUrl() {
    const configured = (this.configService.get<string>('FRONTEND_URLS') || this.configService.get<string>('FRONTEND_URL') || '')
      .split(',')
      .map((part) => part.trim())
      .find(Boolean);
    const base = configured || 'http://localhost:3000';
    return `${stripTrailingSlash(base)}/admin/calendar`;
  }

  private defaultApiOrigin() {
    const configured = (this.configService.get<string>('API_PUBLIC_URL') || '').trim();
    return configured || 'http://localhost:4000';
  }

  private isAllowedFrontendHost(url: URL) {
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    if (url.hostname.endsWith('.vercel.app') && url.hostname.startsWith('crm-suites-o7')) return true;

    const allowed = (this.configService.get<string>('FRONTEND_URLS') || this.configService.get<string>('FRONTEND_URL') || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        try {
          return new URL(part).host;
        } catch {
          return '';
        }
      })
      .filter(Boolean);

    return allowed.includes(url.host);
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  private decrypt(payload: string) {
    const [ivRaw, tagRaw, encryptedRaw] = payload.split('.');
    if (!ivRaw || !tagRaw || !encryptedRaw) return '';
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(ivRaw, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private encryptionKey() {
    const secret =
      this.configService.get<string>('GOOGLE_TOKEN_ENCRYPTION_SECRET') ||
      this.configService.get<string>('CALENDAR_TOKEN_SECRET') ||
      this.configService.get<string>('SUPABASE_JWT_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'dev-google-calendar-token-secret';
    return createHash('sha256').update(secret).digest();
  }

  private signingSecret() {
    return (
      this.configService.get<string>('GOOGLE_OAUTH_STATE_SECRET') ||
      this.configService.get<string>('CALENDAR_FEED_SECRET') ||
      this.configService.get<string>('SUPABASE_JWT_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'dev-google-calendar-state-secret'
    );
  }
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function formatClientDisplayName(client: { firstName?: string | null; name?: string | null }) {
  const firstName = (client.firstName || '').trim();
  const lastName = (client.name || '').trim();
  return `${firstName} ${lastName}`.trim() || 'Client';
}

function normalizeEmail(value?: string | null) {
  const email = (value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function addDaysIso(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toErrorMessage(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err.trim();
  return 'unexpected_error';
}
