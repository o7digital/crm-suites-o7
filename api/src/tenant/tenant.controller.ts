import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { TenantService } from './tenant.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';

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
}

