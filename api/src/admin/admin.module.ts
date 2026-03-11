import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarService } from './google-calendar.service';

@Module({
  controllers: [AdminController, GoogleCalendarController],
  providers: [AdminService, GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class AdminModule {}
