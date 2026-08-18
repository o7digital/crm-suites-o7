import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OliviaIntegrationController } from './olivia-integration.controller';
import { OliviaIntegrationService } from './olivia-integration.service';

@Module({
  imports: [PrismaModule],
  controllers: [OliviaIntegrationController],
  providers: [OliviaIntegrationService],
})
export class OliviaIntegrationModule {}
