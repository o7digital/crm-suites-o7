import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { MovePostSalesCaseDto } from './dto/move-post-sales-case.dto';
import { UpdatePostSalesCaseDto } from './dto/update-post-sales-case.dto';
import { PostSalesService } from './post-sales.service';

@UseGuards(JwtAuthGuard)
@Controller('post-sales')
export class PostSalesController {
  constructor(private readonly postSalesService: PostSalesService) {}

  @Get('cases')
  findAll(@CurrentUser() user: RequestUser) {
    return this.postSalesService.findAll(user);
  }

  @Post('cases/backfill')
  backfill(@CurrentUser() user: RequestUser) {
    return this.postSalesService.backfillWonDeals(user);
  }

  @Post('cases/:id/move')
  move(@Param('id') id: string, @Body() dto: MovePostSalesCaseDto, @CurrentUser() user: RequestUser) {
    return this.postSalesService.move(id, dto, user);
  }

  @Patch('cases/:id')
  update(@Param('id') id: string, @Body() dto: UpdatePostSalesCaseDto, @CurrentUser() user: RequestUser) {
    return this.postSalesService.update(id, dto, user);
  }
}
