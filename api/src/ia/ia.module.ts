import { Module } from '@nestjs/common';
import { IaController } from './ia.controller';
import { HfClientService } from './hf-client.service';

@Module({
  controllers: [IaController],
  providers: [HfClientService],
})
export class IaModule {}
