import { CommandCenterService } from './command-center.service';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService, private readonly commandCenter: CommandCenterService) {}

  @Get('command-center')
  today(@CurrentUser() user: RequestUser, @Query('timeZone') timeZone?: string) {
    return this.commandCenter.get(user, timeZone);
  }

  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.dashboardService.getSnapshot(user);
  }
}
