import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { StagesService } from './stages.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { ReorderStagesDto } from './dto/reorder-stages.dto';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Post()
  create(@Body() dto: CreateStageDto, @CurrentUser() user: RequestUser) {
    return this.stagesService.create(dto, user);
  }

  @Get()
  findAll(@Query('pipelineId') pipelineId: string | undefined, @CurrentUser() user: RequestUser) {
    return this.stagesService.findAll(pipelineId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.stagesService.findOne(id, user);
  }

  @Patch('reorder')
  reorder(@Body() dto: ReorderStagesDto, @CurrentUser() user: RequestUser) {
    return this.stagesService.reorder(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStageDto, @CurrentUser() user: RequestUser) {
    return this.stagesService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.stagesService.remove(id, user);
  }
}
