import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatGptAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    tenantId: string;
    apiKeyId: string;
    endpoint: string;
    statusHttp: number;
  }) {
    try {
      await this.prisma.externalApiAccessLog.create({ data: input });
      if (input.statusHttp >= 200 && input.statusHttp < 400) {
        await this.prisma.externalApiCredential.updateMany({
          where: {
            tenantId: input.tenantId,
            provider: 'CHATGPT',
            keyId: input.apiKeyId,
          },
          data: { lastAccessAt: new Date() },
        });
      }
    } catch {
      // Auditing is best-effort during deploy-time schema upgrades. Never log secrets.
    }
  }
}
