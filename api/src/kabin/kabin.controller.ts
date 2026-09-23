import { Body, Controller, Get, Param, Patch, Post, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { KabinService } from './kabin.service';

@Controller('kabin')
export class KabinController {
  constructor(private readonly service: KabinService) {}

  // Public read only catalogue; tenant is selected by the server configuration.
  @Get('catalogue')
  catalogue() {
    if (!process.env.KABIN_TENANT_ID) throw new ServiceUnavailableException('Kabin tenant is not configured');
    return this.service.catalogue(process.env.KABIN_TENANT_ID);
  }

  @UseGuards(JwtAuthGuard)
  @Get('vehicles')
  vehicles(@CurrentUser() user: RequestUser) { return this.service.vehicles(user.tenantId); }

  @UseGuards(JwtAuthGuard)
  @Post('vehicles')
  createVehicle(@CurrentUser() user: RequestUser, @Body() body: unknown) { return this.service.createVehicle(user.tenantId, body); }

  @UseGuards(JwtAuthGuard)
  @Patch('vehicles/:id')
  updateVehicle(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.updateVehicle(user.tenantId, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('applications')
  applications(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    return this.service.applications(user.tenantId, status);
  }

  @UseGuards(JwtAuthGuard)
  @Post('applications')
  createApplication(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    return this.service.createApplication(user.tenantId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('applications/:id/status')
  updateStatus(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.updateStatus(user.tenantId, id, body);
  }
}
