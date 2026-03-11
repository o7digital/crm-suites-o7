import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { TenantService } from './tenant.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { UpdateTenantSettingsDto } from './dto/update-settings.dto';
import { SendNewsletterDto, SendNewsletterTestDto } from './dto/send-newsletter.dto';

@UseGuards(JwtAuthGuard)
@Controller('tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('branding')
  getBranding(@CurrentUser() user: RequestUser) {
    return this.tenantService.getBranding(user);
  }

  @Patch('branding')
  updateBranding(@Body() dto: UpdateBrandingDto, @CurrentUser() user: RequestUser) {
    return this.tenantService.updateBranding(dto, user);
  }

  @Get('settings')
  getSettings(@CurrentUser() user: RequestUser) {
    return this.tenantService.getSettings(user);
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateTenantSettingsDto, @CurrentUser() user: RequestUser) {
    return this.tenantService.updateSettings(dto, user);
  }

  @Post('newsletter/test')
  sendNewsletterTest(@Body() dto: SendNewsletterTestDto, @CurrentUser() user: RequestUser) {
    return this.tenantService.sendNewsletterTest(dto, user);
  }

  @Post('newsletter/send')
  sendNewsletter(@Body() dto: SendNewsletterDto, @CurrentUser() user: RequestUser) {
    return this.tenantService.sendNewsletter(dto, user);
  }
}
