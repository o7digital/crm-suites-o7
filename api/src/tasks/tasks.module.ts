import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TasksCalendarService } from './tasks-calendar.service';
import { TasksCalendarController } from './tasks-calendar.controller';

@Module({
  imports: [AdminModule],
  controllers: [TasksController, TasksCalendarController],
  providers: [TasksService, TasksCalendarService],
  exports: [TasksService],
})
export class TasksModule {}
