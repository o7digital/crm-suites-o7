import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SchemaUpgraderService } from './schema-upgrader.service';

@Global()
@Module({
  providers: [PrismaService, SchemaUpgraderService],
  exports: [PrismaService, SchemaUpgraderService],
})
export class PrismaModule {}
