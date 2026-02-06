import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ForecastService } from './forecast.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('forecast')
export class ForecastController {
  constructor(private readonly forecastService: ForecastService) {}

  @Get()
  getForecast(@Query('pipelineId') pipelineId: string | undefined, @CurrentUser() user: RequestUser) {
    return this.forecastService.getForecast(pipelineId, user);
  }
}
