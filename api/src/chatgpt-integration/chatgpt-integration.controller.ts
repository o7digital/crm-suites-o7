import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { ChatGptRequest } from './chatgpt-auth.types';
import { ChatGptApiKeyGuard } from './chatgpt-api-key.guard';
import { ChatGptAuditInterceptor } from './chatgpt-audit.interceptor';
import { ChatGptIntegrationService } from './chatgpt-integration.service';
import { RequireChatGptScopes } from './chatgpt-scope.decorator';

@UseGuards(ChatGptApiKeyGuard)
@UseInterceptors(ChatGptAuditInterceptor)
@Controller('integrations/chatgpt')
export class ChatGptIntegrationController {
  constructor(private readonly service: ChatGptIntegrationService) {}

  @Get('summary')
  @RequireChatGptScopes(
    'clients:read',
    'deals:read',
    'tasks:read',
    'invoices:read',
    'forecast:read',
  )
  summary(@Req() request: ChatGptRequest) {
    return this.service.summary(this.tenantId(request));
  }

  @Get('clients')
  @RequireChatGptScopes('clients:read')
  clients(@Req() request: ChatGptRequest, @Query('limit') limit?: string) {
    return this.service.clients(this.tenantId(request), limit);
  }

  @Get('deals')
  @RequireChatGptScopes('deals:read')
  deals(
    @Req() request: ChatGptRequest,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.deals(this.tenantId(request), status, limit);
  }

  @Get('tasks')
  @RequireChatGptScopes('tasks:read')
  tasks(
    @Req() request: ChatGptRequest,
    @Query('overdueOnly') overdueOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.tasks(this.tenantId(request), overdueOnly, limit);
  }

  @Get('invoices')
  @RequireChatGptScopes('invoices:read')
  invoices(
    @Req() request: ChatGptRequest,
    @Query('dueWithinDays') dueWithinDays?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.invoices(this.tenantId(request), dueWithinDays, limit);
  }

  @Get('forecast')
  @RequireChatGptScopes('forecast:read')
  forecast(@Req() request: ChatGptRequest, @Query('month') month?: string) {
    return this.service.forecast(this.tenantId(request), month);
  }

  @Get('pipeline')
  @RequireChatGptScopes('deals:read')
  pipeline(@Req() request: ChatGptRequest) {
    return this.service.pipeline(this.tenantId(request));
  }

  private tenantId(request: ChatGptRequest) {
    // Set exclusively by ChatGptApiKeyGuard from CHATGPT_O7_TENANT_ID.
    return request.chatGptAuth!.tenantId;
  }
}
