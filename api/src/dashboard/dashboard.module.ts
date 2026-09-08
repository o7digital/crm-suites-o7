import { CommandCenterService } from './command-center.service';
import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, CommandCenterService],
})
export class DashboardModule {}
