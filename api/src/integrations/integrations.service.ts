import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { requireWorkspaceAdmin } from '../common/workspace-permissions';
import type { IntegrationStatus } from './contracts';

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}
  async status(user: RequestUser): Promise<{ integrations: IntegrationStatus[] }> {
    await requireWorkspaceAdmin(this.prisma, user);
    const tenant = await this.prisma.tenant.findFirst({ where: { id: user.tenantId }, select: { marketingSetup: true } });
    if (!tenant) throw new NotFoundException('Workspace not found');
    const setup = tenant.marketingSetup as { mailchimp?: { apiKey?: string; audienceId?: string }; fromEmail?: string; replyTo?: string } | null;
    const missing = [!setup?.mailchimp?.apiKey && 'API key', !setup?.mailchimp?.audienceId && 'Audience', !(setup?.replyTo || setup?.fromEmail) && 'Sender'].filter(Boolean) as string[];
    return { integrations: [
      { provider: 'mailchimp', state: missing.length ? 'not_configured' : 'configured_unverified', capabilities: ['test_connection', 'create_draft'], missing, message: 'Testez la connexion dans le studio Mail. Aucun envoi automatique.' },
      { provider: 'cloudbeds', state: 'unavailable', capabilities: [], missing: ['Property ID', 'Authorized API access'], message: 'Interface préparée. Synchronisation des réservations et contacts non activée.' },
      { provider: 'ga4', state: 'unavailable', capabilities: [], missing: ['GA4 property', 'Read-only authorization'], message: 'Interface de rapports préparée. Aucune donnée Analytics récupérée.' },
      { provider: 'olivia', state: 'unavailable', capabilities: [], missing: ['V3.5 endpoint', 'Tenant authorization'], message: 'Interface de jobs préparée. Aucune connexion V3.5 ni action automatique activée.' },
    ] };
  }
}
