import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { TasksCalendarService } from './tasks-calendar.service';

@Controller('calendar')
export class TasksCalendarController {
  constructor(private readonly tasksCalendarService: TasksCalendarService) {}

  @Get('tasks.ics')
  async tasksFeed(@Query('token') token: string, @Res({ passthrough: true }) res: Response) {
    const body = await this.tasksCalendarService.buildFeedFromToken(token);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="o7-pulsecrm-tasks.ics"');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return body;
  }
}
