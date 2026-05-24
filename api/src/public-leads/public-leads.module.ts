import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicLeadsController } from './public-leads.controller';
import { PublicLeadsService } from './public-leads.service';

@Module({
  imports: [PrismaModule],
  controllers: [PublicLeadsController],
  providers: [PublicLeadsService],
})
export class PublicLeadsModule {}
