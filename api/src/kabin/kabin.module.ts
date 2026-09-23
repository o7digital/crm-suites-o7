import { Module } from '@nestjs/common';
import { KabinController } from './kabin.controller';
import { KabinService } from './kabin.service';

@Module({ controllers: [KabinController], providers: [KabinService] })
export class KabinModule {}
