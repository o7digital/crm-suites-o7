import { DealActionsService } from './deal-actions.service';
import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';

@Module({
  controllers: [DealsController],
  providers: [DealsService, DealActionsService],
  exports: [DealsService],
})
export class DealsModule {}
