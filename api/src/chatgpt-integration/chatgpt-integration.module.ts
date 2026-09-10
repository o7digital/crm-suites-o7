import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatGptAdminController } from './chatgpt-admin.controller';
import { ChatGptAdminService } from './chatgpt-admin.service';
import { ChatGptApiKeyGuard } from './chatgpt-api-key.guard';
import { ChatGptAuditInterceptor } from './chatgpt-audit.interceptor';
import { ChatGptAuditService } from './chatgpt-audit.service';
import { ChatGptIntegrationController } from './chatgpt-integration.controller';
import { ChatGptIntegrationService } from './chatgpt-integration.service';

@Module({
  imports: [PrismaModule],
  controllers: [ChatGptIntegrationController, ChatGptAdminController],
  providers: [
    ChatGptIntegrationService,
    ChatGptAdminService,
    ChatGptApiKeyGuard,
    ChatGptAuditInterceptor,
    ChatGptAuditService,
  ],
})
export class ChatGptIntegrationModule {}
