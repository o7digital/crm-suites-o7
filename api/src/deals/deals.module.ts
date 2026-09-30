import { DealActionsService } from './deal-actions.service';
import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { DealRecurrenceService } from './deal-recurrence.service';

@Module({
  controllers: [DealsController],
  providers: [DealsService, DealActionsService, DealRecurrenceService],
  exports: [DealsService],
})
export class DealsModule {}
