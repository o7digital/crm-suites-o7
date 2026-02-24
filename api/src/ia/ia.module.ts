import { Module } from '@nestjs/common';
import { IaController } from './ia.controller';
import { HfClientService } from './hf-client.service';
import { DealsModule } from '../deals/deals.module';

@Module({
  imports: [DealsModule],
  controllers: [IaController],
  providers: [HfClientService],
})
export class IaModule {}
