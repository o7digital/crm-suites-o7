import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { ChatGptAdminService } from './chatgpt-admin.service';

@UseGuards(JwtAuthGuard)
@Controller('admin/integrations/chatgpt')
export class ChatGptAdminController {
  constructor(private readonly service: ChatGptAdminService) {}

  @Get()
  getStatus(@CurrentUser() user: RequestUser) {
    return this.service.getStatus(user);
  }

  @Post('rotate-key')
  rotateKey(@CurrentUser() user: RequestUser) {
    return this.service.rotateKey(user);
  }
}
