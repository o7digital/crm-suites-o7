import { Module } from '@nestjs/common';
import { BootstrapService } from './bootstrap.service';
import { BootstrapController } from './bootstrap.controller';

@Module({
  controllers: [BootstrapController],
  providers: [BootstrapService],
})
export class BootstrapModule {}
