import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PipelinesService } from './pipelines.service';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly pipelinesService: PipelinesService) {}

  @Post()
  create(@Body() dto: CreatePipelineDto, @CurrentUser() user: RequestUser) {
    return this.pipelinesService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.pipelinesService.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.pipelinesService.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePipelineDto, @CurrentUser() user: RequestUser) {
    return this.pipelinesService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.pipelinesService.remove(id, user);
  }
}
