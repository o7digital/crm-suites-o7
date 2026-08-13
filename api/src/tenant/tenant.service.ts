import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { UpdateTenantSettingsDto } from './dto/update-settings.dto';
import { CreateMailchimpDraftDto, SendNewsletterDto, SendNewsletterTestDto } from './dto/send-newsletter.dto';

type ContractClientFieldKey =
  | 'firstName'
  | 'name'
  | 'function'
  | 'companySector'
  | 'email'
  | 'phone'
  | 'company'
  | 'website'
  | 'address'
  | 'taxId'
  | 'notes';

type ContractFieldMapping = {
  placeholder: string;
  clientField: ContractClientFieldKey;
  label?: string;
};

type ContractSetup = {
  templateHref: string;
  fieldMappings: ContractFieldMapping[];
};

type MarketingProvider = 'NONE' | 'MAILCHIMP' | 'BREVO' | 'MAILCOW' | 'SMTP';

type MarketingSmtpConfig = {
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
};

type MarketingMailchimpConfig = {
  apiKey?: string;
  serverPrefix?: string;
  audienceId?: string;
};

type MarketingBrevoConfig = {
  apiKey?: string;
  senderEmail?: string;
  senderName?: string;
};

type MarketingSetup = {
  provider: MarketingProvider;
  accountLabel?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  reservationUrl?: string;
  websiteUrl?: string;
  address?: string;
  phone?: string;
  heroImage?: string;
  gallery?: string[];
  newsletterCampaigns?: MarketingNewsletterCampaign[];
  smtp?: MarketingSmtpConfig | null;
  mailchimp?: MarketingMailchimpConfig | null;
  brevo?: MarketingBrevoConfig | null;
};

type MarketingNewsletterEvent = {
  id: string;
  category: string;
  title: string;
  date: string;
  venue: string;
  description: string;
  url: string;
  sourceLabel: string;
};

type MarketingNewsletterCampaign = {
  id: string;
  month: string;
  sendWindow: string;
  segment: string;
  goal: string;
  status: string;
  lastVerified: string;
  subject: string;
  preheader: string;
  headline: string;
  eyebrow: string;
  heroImage: string;
  body: string;
  bodyHtml?: string;
  cta: string;
  ctaUrl: string;
  highlights: string[];
  events: MarketingNewsletterEvent[];
  mailchimp: {
    campaignType: string;
    tags: string[];
    mergeTags: string[];
    utmCampaign: string;
  };
};

type NewsletterRecipient = {
  email: string;
  firstName?: string | null;
  name?: string | null;
  company?: string | null;
  companySector?: string | null;
};

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}
  private readonly crmDisplayCurrencies = ['USD', 'EUR', 'MXN', 'CAD'] as const;
  private readonly allowedContractClientFields = new Set<ContractClientFieldKey>([
    'firstName',
    'name',
    'function',
    'companySector',
    'email',
    'phone',
    'company',
    'website',
    'address',
    'taxId',
    'notes',
  ]);

  private mapSchemaError(err: unknown): ServiceUnavailableException | null {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Common Prisma codes when tables/columns are missing because migrations haven't run yet.
      if (err.code === 'P2021' || err.code === 'P2022') {
        return new ServiceUnavailableException(
          'Database schema upgrade pending. Redeploy the API (or run migrations), then retry.',
        );
      }
    }
    return null;
  }

  private async getUserRole(user: RequestUser): Promise<'OWNER' | 'ADMIN' | 'MEMBER'> {
    try {
      const dbUser = await this.prisma.user.findFirst({
        where: { id: user.userId, tenantId: user.tenantId },
        select: { role: true },
      });
      return (dbUser?.role as 'OWNER' | 'ADMIN' | 'MEMBER' | undefined) ?? 'MEMBER';
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  private async ensureWorkspaceUser(user: RequestUser) {
    try {
      const dbUser = await this.prisma.user.findFirst({
        where: { id: user.userId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!dbUser) throw new NotFoundException('User not found');
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  private async ensureAdmin(user: RequestUser) {
    const role = await this.getUserRole(user);
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
  }

  private sanitizeContractSetup(raw: unknown): ContractSetup | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    if (typeof raw !== 'object') return null;

    const obj = raw as Record<string, unknown>;
    const templateHref = String(obj.templateHref || '').trim();
    if (!templateHref) return null;
    if (templateHref.length > 240) return null;

    const rawMappings = Array.isArray(obj.fieldMappings) ? obj.fieldMappings : [];
    const fieldMappings: ContractFieldMapping[] = [];
    const seenPlaceholders = new Set<string>();

    for (const entry of rawMappings) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      const placeholder = String(item.placeholder || '').trim();
      const clientField = String(item.clientField || '').trim() as ContractClientFieldKey;
      const labelRaw = String(item.label || '').trim();

      if (!/^[a-zA-Z0-9_]{1,80}$/.test(placeholder)) continue;
      if (!this.allowedContractClientFields.has(clientField)) continue;
      if (seenPlaceholders.has(placeholder)) continue;

      seenPlaceholders.add(placeholder);
      fieldMappings.push({
        placeholder,
        clientField,
        ...(labelRaw ? { label: labelRaw.slice(0, 120) } : {}),
      });
    }

    return {
      templateHref,
      fieldMappings,
    };
  }

  private sanitizeMarketingSetup(raw: unknown): MarketingSetup | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    if (typeof raw !== 'object') return null;

    const obj = raw as Record<string, unknown>;
    const cleanText = (value: unknown, max = 240) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed ? trimmed.slice(0, max) : undefined;
    };
    const cleanSecret = (value: unknown, max = 400) => {
      if (typeof value !== 'string') return undefined;
      return value.length > 0 ? value.slice(0, max) : undefined;
    };
    const cleanUrl = (value: unknown, max = 1000) => {
      const candidate = cleanText(value, max);
      if (!candidate) return undefined;
      try {
        const url = new URL(candidate);
        return url.protocol === 'https:' || url.protocol === 'http:' ? candidate : undefined;
      } catch {
        return undefined;
      }
    };
    const cleanStringList = (value: unknown, maxItems: number, maxLength: number) => {
      if (!Array.isArray(value)) return [];
      return value
        .map((item) => cleanText(item, maxLength))
        .filter((item): item is string => Boolean(item))
        .slice(0, maxItems);
    };
    const cleanPort = (value: unknown) => {
      const parsed = typeof value === 'number' ? value : Number(String(value || ''));
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) return undefined;
      return Math.round(parsed);
    };
    const providerRaw = typeof obj.provider === 'string' ? obj.provider.trim().toUpperCase() : 'NONE';
    const provider = (['NONE', 'MAILCHIMP', 'BREVO', 'MAILCOW', 'SMTP'].includes(providerRaw)
      ? providerRaw
      : 'NONE') as MarketingProvider;

    const smtpRaw = obj.smtp && typeof obj.smtp === 'object' ? (obj.smtp as Record<string, unknown>) : null;
    const mailchimpRaw =
      obj.mailchimp && typeof obj.mailchimp === 'object' ? (obj.mailchimp as Record<string, unknown>) : null;
    const brevoRaw = obj.brevo && typeof obj.brevo === 'object' ? (obj.brevo as Record<string, unknown>) : null;
    const rawCampaigns = Array.isArray(obj.newsletterCampaigns) ? obj.newsletterCampaigns : [];

    const smtp: MarketingSmtpConfig | null =
      smtpRaw &&
      (cleanText(smtpRaw.host, 240) ||
        cleanPort(smtpRaw.port) ||
        typeof smtpRaw.secure === 'boolean' ||
        cleanText(smtpRaw.username, 240) ||
        cleanSecret(smtpRaw.password, 400))
        ? {
            ...(cleanText(smtpRaw.host, 240) ? { host: cleanText(smtpRaw.host, 240) } : {}),
            ...(cleanPort(smtpRaw.port) ? { port: cleanPort(smtpRaw.port) } : {}),
            ...(typeof smtpRaw.secure === 'boolean' ? { secure: smtpRaw.secure } : {}),
            ...(cleanText(smtpRaw.username, 240) ? { username: cleanText(smtpRaw.username, 240) } : {}),
            ...(cleanSecret(smtpRaw.password, 400) ? { password: cleanSecret(smtpRaw.password, 400) } : {}),
          }
        : null;

    const mailchimp: MarketingMailchimpConfig | null =
      mailchimpRaw &&
      (cleanSecret(mailchimpRaw.apiKey, 400) ||
        cleanText(mailchimpRaw.serverPrefix, 80) ||
        cleanText(mailchimpRaw.audienceId, 120))
        ? {
            ...(cleanSecret(mailchimpRaw.apiKey, 400) ? { apiKey: cleanSecret(mailchimpRaw.apiKey, 400) } : {}),
            ...(cleanText(mailchimpRaw.serverPrefix, 80)
              ? { serverPrefix: cleanText(mailchimpRaw.serverPrefix, 80) }
              : {}),
            ...(cleanText(mailchimpRaw.audienceId, 120) ? { audienceId: cleanText(mailchimpRaw.audienceId, 120) } : {}),
          }
        : null;

    const brevo: MarketingBrevoConfig | null =
      brevoRaw &&
      (cleanSecret(brevoRaw.apiKey, 400) ||
        cleanText(brevoRaw.senderEmail, 240) ||
        cleanText(brevoRaw.senderName, 140))
        ? {
            ...(cleanSecret(brevoRaw.apiKey, 400) ? { apiKey: cleanSecret(brevoRaw.apiKey, 400) } : {}),
            ...(cleanText(brevoRaw.senderEmail, 240)
              ? { senderEmail: cleanText(brevoRaw.senderEmail, 240) }
              : {}),
            ...(cleanText(brevoRaw.senderName, 140)
              ? { senderName: cleanText(brevoRaw.senderName, 140) }
              : {}),
          }
        : null;

    const newsletterCampaigns: MarketingNewsletterCampaign[] = [];
    for (const rawCampaign of rawCampaigns.slice(0, 12)) {
      if (!rawCampaign || typeof rawCampaign !== 'object') continue;
      const campaign = rawCampaign as Record<string, unknown>;
      const id = cleanText(campaign.id, 100);
      const month = cleanText(campaign.month, 40);
      if (!id || !month) continue;

      const events: MarketingNewsletterEvent[] = [];
      const rawEvents = Array.isArray(campaign.events) ? campaign.events : [];
      for (const rawEvent of rawEvents.slice(0, 8)) {
        if (!rawEvent || typeof rawEvent !== 'object') continue;
        const event = rawEvent as Record<string, unknown>;
        const eventId = cleanText(event.id, 100);
        const title = cleanText(event.title, 180);
        if (!eventId || !title) continue;
        events.push({
          id: eventId,
          category: cleanText(event.category, 60) || 'Événement',
          title,
          date: cleanText(event.date, 160) || '',
          venue: cleanText(event.venue, 180) || '',
          description: cleanText(event.description, 800) || '',
          url: cleanUrl(event.url) || '',
          sourceLabel: cleanText(event.sourceLabel, 120) || '',
        });
      }

      const mailchimpRaw =
        campaign.mailchimp && typeof campaign.mailchimp === 'object'
          ? (campaign.mailchimp as Record<string, unknown>)
          : {};
      newsletterCampaigns.push({
        id,
        month,
        sendWindow: cleanText(campaign.sendWindow, 180) || '',
        segment: cleanText(campaign.segment, 800) || '',
        goal: cleanText(campaign.goal, 800) || '',
        status: cleanText(campaign.status, 40) || 'DRAFT',
        lastVerified: cleanText(campaign.lastVerified, 20) || '',
        subject: cleanText(campaign.subject, 160) || '',
        preheader: cleanText(campaign.preheader, 180) || '',
        headline: cleanText(campaign.headline, 180) || '',
        eyebrow: cleanText(campaign.eyebrow, 180) || '',
        heroImage: cleanUrl(campaign.heroImage) || '',
        body: cleanText(campaign.body, 20000) || '',
        ...(cleanText(campaign.bodyHtml, 50000) ? { bodyHtml: cleanText(campaign.bodyHtml, 50000) } : {}),
        cta: cleanText(campaign.cta, 120) || '',
        ctaUrl: cleanUrl(campaign.ctaUrl) || '',
        highlights: cleanStringList(campaign.highlights, 6, 160),
        events,
        mailchimp: {
          campaignType: cleanText(mailchimpRaw.campaignType, 30) || 'regular',
          tags: cleanStringList(mailchimpRaw.tags, 12, 60),
          mergeTags: cleanStringList(mailchimpRaw.mergeTags, 12, 60),
          utmCampaign: cleanText(mailchimpRaw.utmCampaign, 100) || '',
        },
      });
    }

    return {
      provider,
      ...(cleanText(obj.accountLabel, 140) ? { accountLabel: cleanText(obj.accountLabel, 140) } : {}),
      ...(cleanText(obj.fromName, 140) ? { fromName: cleanText(obj.fromName, 140) } : {}),
      ...(cleanText(obj.fromEmail, 240) ? { fromEmail: cleanText(obj.fromEmail, 240) } : {}),
      ...(cleanText(obj.replyTo, 240) ? { replyTo: cleanText(obj.replyTo, 240) } : {}),
      ...(cleanUrl(obj.reservationUrl) ? { reservationUrl: cleanUrl(obj.reservationUrl) } : {}),
      ...(cleanUrl(obj.websiteUrl) ? { websiteUrl: cleanUrl(obj.websiteUrl) } : {}),
      ...(cleanText(obj.address, 300) ? { address: cleanText(obj.address, 300) } : {}),
      ...(cleanText(obj.phone, 80) ? { phone: cleanText(obj.phone, 80) } : {}),
      ...(cleanUrl(obj.heroImage) ? { heroImage: cleanUrl(obj.heroImage) } : {}),
      ...(cleanStringList(obj.gallery, 8, 1000).length
        ? { gallery: cleanStringList(obj.gallery, 8, 1000).filter((item) => Boolean(cleanUrl(item))) }
        : {}),
      ...(newsletterCampaigns.length ? { newsletterCampaigns } : {}),
      ...(smtp ? { smtp } : {}),
      ...(mailchimp ? { mailchimp } : {}),
      ...(brevo ? { brevo } : {}),
    };
  }

  private isValidEmail(value: string | null | undefined): value is string {
    if (!value) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  private supportsDirectNewsletterSend(provider: MarketingProvider) {
    return provider === 'SMTP' || provider === 'MAILCOW';
  }

  private getNewsletterTransportConfig(setup: MarketingSetup | null) {
    if (!setup || !this.supportsDirectNewsletterSend(setup.provider)) {
      throw new BadRequestException('Direct newsletter sending requires an SMTP or Mailcow connector.');
    }

    const smtp = setup.smtp || {};
    const host = String(smtp.host || '').trim();
    const username = String(smtp.username || '').trim();
    const password = typeof smtp.password === 'string' ? smtp.password : '';
    const fromEmail = String(setup.fromEmail || '').trim();
    const fromName = String(setup.fromName || '').trim();
    const replyTo = String(setup.replyTo || '').trim();
    const port = Number(smtp.port || (smtp.secure ? 465 : 587));
    const secure = typeof smtp.secure === 'boolean' ? smtp.secure : port === 465;

    if (!host) throw new BadRequestException('SMTP host is required.');
    if (!Number.isFinite(port) || port < 1 || port > 65535) throw new BadRequestException('SMTP port is invalid.');
    if (!username) throw new BadRequestException('SMTP username is required.');
    if (!password) throw new BadRequestException('SMTP password is required.');
    if (!this.isValidEmail(fromEmail)) throw new BadRequestException('Sender email is required.');
    if (replyTo && !this.isValidEmail(replyTo)) throw new BadRequestException('Reply-to email is invalid.');

    return {
      host,
      port,
      secure,
      username,
      password,
      fromEmail,
      fromName: fromName || undefined,
      replyTo: replyTo || undefined,
    };
  }

  private renderNewsletterTemplate(template: string, recipient: NewsletterRecipient) {
    const firstName = String(recipient.firstName || '').trim();
    const lastName = String(recipient.name || '').trim();
    const company = String(recipient.company || '').trim();
    const companySector = String(recipient.companySector || '').trim();

    const tokens: Record<string, string> = {
      firstName,
      name: lastName,
      fullName: [firstName, lastName].filter(Boolean).join(' ').trim(),
      company,
      companySector,
      email: recipient.email,
    };

    return template.replace(/\{\{\s*(firstName|name|fullName|company|companySector|email)\s*\}\}/g, (_match, key) => {
      return tokens[key] || '';
    });
  }

  private escapeHtml(raw: string) {
    return raw
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private buildNewsletterHtml(subject: string, body: string, preheader?: string) {
    const escapedSubject = this.escapeHtml(subject);
    const escapedPreheader = preheader ? this.escapeHtml(preheader) : '';
    const bodyHtml = this.escapeHtml(body)
      .split(/\n{2,}/)
      .map((paragraph) => `<p style="margin:0 0 16px;">${paragraph.replace(/\n/g, '<br />')}</p>`)
      .join('');

    return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#0b1021;color:#e9edf5;font-family:Inter,Segoe UI,sans-serif;">
    ${escapedPreheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapedPreheader}</div>` : ''}
    <div style="max-width:680px;margin:0 auto;background:#151d32;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:32px;">
      <h1 style="margin:0 0 20px;font-size:28px;line-height:1.1;">${escapedSubject}</h1>
      <div style="font-size:15px;line-height:1.7;color:#d7e1f0;">${bodyHtml}</div>
    </div>
  </body>
</html>`;
  }

  private async dispatchNewsletter(
    setup: MarketingSetup | null,
    payload: { recipients: NewsletterRecipient[]; subject: string; preheader?: string; body: string },
  ) {
    const config = this.getNewsletterTransportConfig(setup);
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: config.password,
      },
    });

    await transporter.verify();

    const failed: string[] = [];
    let sentCount = 0;

    for (const recipient of payload.recipients) {
      const renderedSubject = this.renderNewsletterTemplate(payload.subject, recipient);
      const renderedBody = this.renderNewsletterTemplate(payload.body, recipient);
      const renderedPreheader = payload.preheader
        ? this.renderNewsletterTemplate(payload.preheader, recipient)
        : undefined;

      try {
        await transporter.sendMail({
          from: config.fromName ? { name: config.fromName, address: config.fromEmail } : config.fromEmail,
          to: recipient.email,
          ...(config.replyTo ? { replyTo: config.replyTo } : {}),
          subject: renderedSubject,
          text: renderedBody,
          html: this.buildNewsletterHtml(renderedSubject, renderedBody, renderedPreheader),
        });
        sentCount += 1;
      } catch (err) {
        failed.push(`${recipient.email}: ${err instanceof Error ? err.message : 'send failed'}`);
      }
    }

    return { sentCount, failed };
  }

  private getMailchimpConfig(setup: MarketingSetup | null) {
    if (!setup || setup.provider !== 'MAILCHIMP') {
      throw new BadRequestException('Select Mailchimp as the marketing provider first.');
    }

    const apiKey = String(setup.mailchimp?.apiKey || '').trim();
    const keyPrefix = apiKey.includes('-') ? apiKey.split('-').at(-1) : '';
    const serverPrefix = String(setup.mailchimp?.serverPrefix || keyPrefix || '')
      .trim()
      .toLowerCase();
    const audienceId = String(setup.mailchimp?.audienceId || '').trim();
    const fromName = String(setup.fromName || '').trim();
    const replyTo = String(setup.replyTo || setup.fromEmail || '').trim();

    if (!apiKey) throw new BadRequestException('Mailchimp API key is required.');
    if (!/^[a-z]{2,10}\d+$/.test(serverPrefix)) {
      throw new BadRequestException('Mailchimp server prefix is invalid (example: us21).');
    }
    if (!audienceId) throw new BadRequestException('Mailchimp audience ID is required.');
    if (!fromName) throw new BadRequestException('Mailchimp sender name is required.');
    if (!this.isValidEmail(replyTo)) throw new BadRequestException('Mailchimp reply-to email is invalid.');

    return {
      apiKey,
      serverPrefix,
      audienceId,
      fromName,
      replyTo,
      baseUrl: `https://${serverPrefix}.api.mailchimp.com/3.0`,
    };
  }

  private async mailchimpRequest<T>(
    config: ReturnType<TenantService['getMailchimpConfig']>,
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Basic ${Buffer.from(`crm:${config.apiKey}`).toString('base64')}`,
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      });
    } catch {
      throw new ServiceUnavailableException('Mailchimp is temporarily unreachable.');
    }

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const problem = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
      const rawDetail = problem?.detail ?? problem?.title;
      const detail = typeof rawDetail === 'string' ? rawDetail : '';
      throw new BadRequestException(`Mailchimp: ${detail || `request failed (${response.status})`}`);
    }

    return payload as T;
  }

  async testMailchimp(user: RequestUser) {
    await this.ensureAdmin(user);
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: user.tenantId },
      select: { marketingSetup: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const setup = this.sanitizeMarketingSetup(tenant.marketingSetup) ?? null;
    const config = this.getMailchimpConfig(setup);
    const ping = await this.mailchimpRequest<{ health_status?: string }>(config, '/ping');
    return {
      ok: true,
      healthStatus: ping.health_status || 'Everything is Chimpy!',
      serverPrefix: config.serverPrefix,
      audienceId: config.audienceId,
    };
  }

  async createMailchimpDraft(dto: CreateMailchimpDraftDto, user: RequestUser) {
    await this.ensureAdmin(user);
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: user.tenantId },
      select: { marketingSetup: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const setup = this.sanitizeMarketingSetup(tenant.marketingSetup) ?? null;
    const config = this.getMailchimpConfig(setup);
    const campaign = await this.mailchimpRequest<{ id: string; web_id?: number; status?: string }>(config, '/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        type: 'regular',
        recipients: { list_id: config.audienceId },
        settings: {
          subject_line: dto.subject.trim(),
          preview_text: dto.preheader?.trim() || '',
          title: dto.campaignTitle.trim(),
          from_name: config.fromName,
          reply_to: config.replyTo,
          auto_footer: false,
          inline_css: true,
        },
        tracking: {
          opens: true,
          html_clicks: true,
          text_clicks: true,
          ...(dto.utmCampaign?.trim() ? { google_analytics: dto.utmCampaign.trim() } : {}),
        },
      }),
    });

    try {
      await this.mailchimpRequest(config, `/campaigns/${encodeURIComponent(campaign.id)}/content`, {
        method: 'PUT',
        body: JSON.stringify({
          html: dto.html,
          ...(dto.plainText?.trim() ? { plain_text: dto.plainText } : {}),
        }),
      });
    } catch (err) {
      await this.mailchimpRequest(config, `/campaigns/${encodeURIComponent(campaign.id)}`, { method: 'DELETE' }).catch(
        () => undefined,
      );
      throw err;
    }

    return {
      ok: true,
      campaignId: campaign.id,
      webId: campaign.web_id ?? null,
      status: campaign.status || 'save',
      editUrl: campaign.web_id
        ? `https://${config.serverPrefix}.admin.mailchimp.com/campaigns/show/?id=${campaign.web_id}`
        : null,
    };
  }

  async getBranding(user: RequestUser) {
    try {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: user.tenantId },
        select: {
          id: true,
          name: true,
          logoDataUrl: true,
          backgroundColor: true,
          surfaceColor: true,
          cardColor: true,
          foregroundColor: true,
          mutedColor: true,
          accentColor: true,
          accentColor2: true,
          updatedAt: true,
        },
      });
      if (!tenant) throw new NotFoundException('Tenant not found');
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        branding: {
          logoDataUrl: tenant.logoDataUrl,
          backgroundColor: tenant.backgroundColor,
          surfaceColor: tenant.surfaceColor,
          cardColor: tenant.cardColor,
          foregroundColor: tenant.foregroundColor,
          mutedColor: tenant.mutedColor,
          accentColor: tenant.accentColor,
          accentColor2: tenant.accentColor2,
        },
        updatedAt: tenant.updatedAt,
      };
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  async updateBranding(dto: UpdateBrandingDto, user: RequestUser) {
    await this.ensureWorkspaceUser(user);

    const normalize = (value: string | null | undefined) => {
      if (value === null) return null;
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };

    try {
      const updated = await this.prisma.tenant.update({
        where: { id: user.tenantId },
        data: {
          logoDataUrl: normalize(dto.logoDataUrl),
          backgroundColor: normalize(dto.backgroundColor),
          surfaceColor: normalize(dto.surfaceColor),
          cardColor: normalize(dto.cardColor),
          foregroundColor: normalize(dto.foregroundColor),
          mutedColor: normalize(dto.mutedColor),
          accentColor: normalize(dto.accentColor),
          accentColor2: normalize(dto.accentColor2),
        },
        select: {
          id: true,
          name: true,
          logoDataUrl: true,
          backgroundColor: true,
          surfaceColor: true,
          cardColor: true,
          foregroundColor: true,
          mutedColor: true,
          accentColor: true,
          accentColor2: true,
          updatedAt: true,
        },
      });

      return {
        tenantId: updated.id,
        tenantName: updated.name,
        branding: {
          logoDataUrl: updated.logoDataUrl,
          backgroundColor: updated.backgroundColor,
          surfaceColor: updated.surfaceColor,
          cardColor: updated.cardColor,
          foregroundColor: updated.foregroundColor,
          mutedColor: updated.mutedColor,
          accentColor: updated.accentColor,
          accentColor2: updated.accentColor2,
        },
        updatedAt: updated.updatedAt,
      };
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  async getSettings(user: RequestUser) {
    try {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: user.tenantId },
        select: {
          id: true,
          name: true,
          crmMode: true,
          crmDisplayCurrency: true,
          industry: true,
          contractSetup: true,
          marketingSetup: true,
          updatedAt: true,
        },
      });
      if (!tenant) throw new NotFoundException('Tenant not found');
      const currency = String(tenant.crmDisplayCurrency || 'MXN').toUpperCase();
      const crmDisplayCurrency = this.crmDisplayCurrencies.includes(currency as (typeof this.crmDisplayCurrencies)[number])
        ? (currency as (typeof this.crmDisplayCurrencies)[number])
        : 'MXN';
      const contractSetup = this.sanitizeContractSetup(tenant.contractSetup);
      const marketingSetup = this.sanitizeMarketingSetup(tenant.marketingSetup);
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        settings: {
          crmMode: (tenant.crmMode || 'B2B') as 'B2B' | 'B2C',
          crmDisplayCurrency,
          industry: tenant.industry ?? null,
          contractSetup: contractSetup ?? null,
          marketingSetup: marketingSetup ?? null,
        },
        updatedAt: tenant.updatedAt,
      };
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  async updateSettings(dto: UpdateTenantSettingsDto, user: RequestUser) {
    await this.ensureAdmin(user);

    const normalize = (value: string | null | undefined) => {
      if (value === null) return null;
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };

    const nextCrmMode = dto.crmMode === 'B2B' || dto.crmMode === 'B2C' ? dto.crmMode : undefined;
    const nextCrmDisplayCurrency = dto.crmDisplayCurrency
      ? String(dto.crmDisplayCurrency).toUpperCase()
      : undefined;
    const nextContractSetup = this.sanitizeContractSetup(dto.contractSetup);
    const nextMarketingSetup = this.sanitizeMarketingSetup(dto.marketingSetup);

    try {
      const updated = await this.prisma.tenant.update({
        where: { id: user.tenantId },
        data: {
          crmMode: nextCrmMode,
          crmDisplayCurrency: nextCrmDisplayCurrency,
          industry: normalize(dto.industry),
          ...(nextContractSetup !== undefined
            ? {
                contractSetup:
                  nextContractSetup === null
                    ? Prisma.DbNull
                    : (nextContractSetup as Prisma.InputJsonValue),
              }
            : {}),
          ...(nextMarketingSetup !== undefined
            ? {
                marketingSetup:
                  nextMarketingSetup === null
                    ? Prisma.DbNull
                    : (nextMarketingSetup as Prisma.InputJsonValue),
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          crmMode: true,
          crmDisplayCurrency: true,
          industry: true,
          contractSetup: true,
          marketingSetup: true,
          updatedAt: true,
        },
      });

      // Keep pipeline default aligned with the tenant mode when possible.
      await this.enforceDefaultPipeline(updated.id, updated.crmMode || 'B2B');

      const currency = String(updated.crmDisplayCurrency || 'MXN').toUpperCase();
      const crmDisplayCurrency = this.crmDisplayCurrencies.includes(currency as (typeof this.crmDisplayCurrencies)[number])
        ? (currency as (typeof this.crmDisplayCurrencies)[number])
        : 'MXN';
      const contractSetup = this.sanitizeContractSetup(updated.contractSetup);
      const marketingSetup = this.sanitizeMarketingSetup(updated.marketingSetup);

      return {
        tenantId: updated.id,
        tenantName: updated.name,
        settings: {
          crmMode: (updated.crmMode || 'B2B') as 'B2B' | 'B2C',
          crmDisplayCurrency,
          industry: updated.industry ?? null,
          contractSetup: contractSetup ?? null,
          marketingSetup: marketingSetup ?? null,
        },
        updatedAt: updated.updatedAt,
      };
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  async sendNewsletterTest(dto: SendNewsletterTestDto, user: RequestUser) {
    await this.ensureAdmin(user);
    if (!this.isValidEmail(user.email)) {
      throw new BadRequestException('Your user email is missing or invalid.');
    }

    try {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: user.tenantId },
        select: { name: true, marketingSetup: true },
      });
      if (!tenant) throw new NotFoundException('Tenant not found');

      const setup = this.sanitizeMarketingSetup(tenant.marketingSetup) ?? null;
      const recipient: NewsletterRecipient = {
        email: user.email,
        firstName: String(user.name || '').split(/\s+/).filter(Boolean)[0] || null,
        name: user.name || null,
        company: user.tenantName || tenant.name,
      };

      const result = await this.dispatchNewsletter(setup, {
        recipients: [recipient],
        subject: dto.subject,
        preheader: dto.preheader,
        body: dto.body,
      });

      if (result.sentCount === 0) {
        throw new BadRequestException(result.failed[0] || 'Unable to send test newsletter.');
      }

      return {
        ok: true,
        testEmail: user.email,
        sentCount: result.sentCount,
        failed: result.failed,
      };
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  async sendNewsletter(dto: SendNewsletterDto, user: RequestUser) {
    await this.ensureAdmin(user);

    try {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: user.tenantId },
        select: { marketingSetup: true },
      });
      if (!tenant) throw new NotFoundException('Tenant not found');

      const setup = this.sanitizeMarketingSetup(tenant.marketingSetup) ?? null;
      const clients = await this.prisma.client.findMany({
        where: {
          tenantId: user.tenantId,
          id: { in: dto.clientIds },
        },
        select: {
          email: true,
          firstName: true,
          name: true,
          company: true,
          companySector: true,
        },
      });

      const recipientsByEmail = new Map<string, NewsletterRecipient>();
      for (const client of clients) {
        const email = String(client.email || '').trim().toLowerCase();
        if (!this.isValidEmail(email) || recipientsByEmail.has(email)) continue;
        recipientsByEmail.set(email, {
          email,
          firstName: client.firstName,
          name: client.name,
          company: client.company,
          companySector: client.companySector,
        });
      }

      const recipients = [...recipientsByEmail.values()];
      if (recipients.length === 0) {
        throw new BadRequestException('No valid client emails found in the selected audience.');
      }

      const result = await this.dispatchNewsletter(setup, {
        recipients,
        subject: dto.subject,
        preheader: dto.preheader,
        body: dto.body,
      });

      return {
        ok: true,
        audienceSize: recipients.length,
        sentCount: result.sentCount,
        failed: result.failed,
      };
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  private async enforceDefaultPipeline(tenantId: string, crmMode: string) {
    const desiredName = crmMode === 'B2C' ? 'B2C' : 'New Sales';
    const desired = await this.prisma.pipeline.findFirst({
      where: { tenantId, name: desiredName },
      select: { id: true },
    });
    if (!desired) return;

    await this.prisma.pipeline.updateMany({ where: { tenantId }, data: { isDefault: false } });
    await this.prisma.pipeline.update({ where: { id: desired.id }, data: { isDefault: true } });
  }
}
