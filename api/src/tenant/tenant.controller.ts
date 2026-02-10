import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { TenantService } from './tenant.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { UpdateTenantSettingsDto } from './dto/update-settings.dto';

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
}
