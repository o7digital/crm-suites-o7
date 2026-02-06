import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DealsService } from './deals.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { MoveStageDto } from './dto/move-stage.dto';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('deals')
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Post()
  create(@Body() dto: CreateDealDto, @CurrentUser() user: RequestUser) {
    return this.dealsService.create(dto, user);
  }

  @Get()
  findAll(@Query('pipelineId') pipelineId: string | undefined, @CurrentUser() user: RequestUser) {
    return this.dealsService.findAll(pipelineId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.dealsService.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDealDto, @CurrentUser() user: RequestUser) {
    return this.dealsService.update(id, dto, user);
  }

  @Post(':id/move-stage')
  moveStage(@Param('id') id: string, @Body() dto: MoveStageDto, @CurrentUser() user: RequestUser) {
    return this.dealsService.moveStage(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.dealsService.remove(id, user);
  }
}
