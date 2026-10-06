import { Injectable, BadRequestException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SignatureMailService {
  constructor(private prisma: PrismaService) {}
  private async config(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, marketingSetup: true },
    });
    const setup = (tenant?.marketingSetup || {}) as Record<string, any>;
    const smtp = setup.smtp || {};
    const configured =
      ['SMTP', 'MAILCOW'].includes(setup.provider) &&
      !!(smtp.host && smtp.username && smtp.password && setup.fromEmail);
    return { setup, smtp, configured, name: tenant?.name || 'o7 CRM' };
  }
  async status(tenantId: string) {
    const c = await this.config(tenantId);
    return {
      configured: c.configured,
      provider: c.setup.provider || 'NONE',
      fromEmail: c.setup.fromEmail || null,
    };
  }
  async ready(tenantId: string) {
    const c = await this.config(tenantId);
    if (!c.configured)
      throw new BadRequestException(
        'Configure the SMTP/Mailcow connector and sender address in this workspace’s Mailing settings before sending signature requests.',
      );
    return c;
  }
  async send(
    tenantId: string,
    to: string,
    subject: string,
    body: string,
    attachment?: Buffer,
  ) {
    const c = await this.ready(tenantId);
    const transport = nodemailer.createTransport({
      host: c.smtp.host,
      port: Number(c.smtp.port || (c.smtp.secure ? 465 : 587)),
      secure:
        typeof c.smtp.secure === 'boolean'
          ? c.smtp.secure
          : Number(c.smtp.port) === 465,
      auth: { user: c.smtp.username, pass: c.smtp.password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    const result = await transport.sendMail({
      from: { name: c.setup.fromName || c.name, address: c.setup.fromEmail },
      replyTo: c.setup.replyTo || undefined,
      to,
      subject,
      text: body,
      ...(attachment
        ? {
            attachments: [
              {
                filename: 'signed-document.pdf',
                content: attachment,
                contentType: 'application/pdf',
              },
            ],
          }
        : {}),
    });
    if (!result.accepted?.length)
      throw new BadRequestException(
        'The mail server did not accept the recipient.',
      );
  }
}
