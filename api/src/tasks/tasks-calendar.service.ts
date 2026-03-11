import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/user.decorator';

type FeedClaims = {
  v: 1;
  userId: string;
  tenantId: string;
};

@Injectable()
export class TasksCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getFeedConfig(user: RequestUser) {
    const scheduledTaskCount = await this.prisma.task.count({
      where: {
        tenantId: user.tenantId,
        dueDate: { not: null },
      },
    });

    return {
      feedToken: this.signFeedClaims({
        v: 1,
        userId: user.userId,
        tenantId: user.tenantId,
      }),
      currentUserEmail: user.email || '',
      scheduledTaskCount,
    };
  }

  async buildFeedFromToken(token: string) {
    const claims = this.verifyFeedToken(token);

    const [tenant, currentUser, tasks] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: claims.tenantId },
        select: { name: true },
      }),
      this.prisma.user.findFirst({
        where: {
          id: claims.userId,
          tenantId: claims.tenantId,
        },
        select: { email: true },
      }),
      this.prisma.task.findMany({
        where: {
          tenantId: claims.tenantId,
          dueDate: { not: null },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        include: {
          client: {
            select: {
              firstName: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const calName = `${tenant?.name || 'o7 PulseCRM'} - Tasks`;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//o7 PulseCRM//Tasks Feed//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeIcsText(calName)}`,
      'X-WR-TIMEZONE:UTC',
    ];

    for (const task of tasks) {
      const dueIso = task.dueDate?.toISOString().slice(0, 10);
      if (!dueIso) continue;

      const details = [
        'CRM task from o7 PulseCRM',
        `Status: ${task.status}`,
        task.client ? `Client: ${formatClientDisplayName(task.client)}` : '',
        task.client?.email ? `Client email: ${task.client.email}` : '',
        task.timeSpentHours ? `Hours spent: ${task.timeSpentHours.toString()}h` : '',
      ].filter(Boolean);

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${task.id}@o7pulsecrm.local`);
      lines.push(`DTSTAMP:${formatUtcDateTime(task.updatedAt || new Date())}`);
      lines.push(`LAST-MODIFIED:${formatUtcDateTime(task.updatedAt || new Date())}`);
      lines.push(`SUMMARY:${escapeIcsText(task.title || 'CRM task')}`);
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(dueIso)}`);
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(addDaysIso(dueIso, 1))}`);
      lines.push(`DESCRIPTION:${escapeIcsText(details.join('\n'))}`);
      if (normalizeEmail(currentUser?.email)) {
        lines.push(`ORGANIZER:mailto:${normalizeEmail(currentUser?.email)}`);
      }
      if (normalizeEmail(task.client?.email)) {
        const clientName = formatClientDisplayName(task.client);
        lines.push(`ATTENDEE;CN=${escapeIcsParam(clientName)}:mailto:${normalizeEmail(task.client?.email)}`);
      }
      lines.push('STATUS:CONFIRMED');
      lines.push('TRANSP:OPAQUE');
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return `${lines.join('\r\n')}\r\n`;
  }

  private signFeedClaims(claims: FeedClaims) {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = this.createSignature(payload);
    return `${payload}.${signature}`;
  }

  private verifyFeedToken(token: string): FeedClaims {
    if (!token) {
      throw new BadRequestException('Missing calendar feed token');
    }

    const [payload, signature] = token.split('.');
    if (!payload || !signature) {
      throw new UnauthorizedException('Invalid calendar feed token');
    }

    const expected = this.createSignature(payload);
    const signatureBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
      throw new UnauthorizedException('Invalid calendar feed token');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid calendar feed token');
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as FeedClaims).v !== 1 ||
      typeof (parsed as FeedClaims).tenantId !== 'string' ||
      typeof (parsed as FeedClaims).userId !== 'string'
    ) {
      throw new UnauthorizedException('Invalid calendar feed token');
    }

    return parsed as FeedClaims;
  }

  private createSignature(payload: string) {
    return createHmac('sha256', this.feedSecret()).update(payload).digest('base64url');
  }

  private feedSecret() {
    return (
      this.configService.get<string>('CALENDAR_FEED_SECRET') ||
      this.configService.get<string>('SUPABASE_JWT_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'dev-calendar-feed-secret'
    );
  }
}

function formatClientDisplayName(client: { firstName?: string | null; name?: string | null }) {
  const firstName = (client.firstName || '').trim();
  const lastName = (client.name || '').trim();
  return `${firstName} ${lastName}`.trim() || 'Client';
}

function toIcsDate(iso: string) {
  return iso.replaceAll('-', '');
}

function formatUtcDateTime(value: Date) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function addDaysIso(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function escapeIcsParam(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/:/g, '\\:');
}

function normalizeEmail(value?: string | null) {
  const email = (value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}
