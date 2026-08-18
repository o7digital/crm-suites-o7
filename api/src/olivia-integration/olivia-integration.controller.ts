import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OliviaIntegrationService,
  type OliviaOpportunityPayload,
} from './olivia-integration.service';

@Controller('integrations/olivia')
export class OliviaIntegrationController {
  constructor(
    private readonly oliviaIntegrationService: OliviaIntegrationService,
  ) {}

  @Post('opportunities')
  createOpportunity(
    @Body() body: unknown,
    @Headers('x-o7-integration-secret') secret?: string,
  ) {
    if (
      !process.env.OLIVIA_INTEGRATION_SECRET ||
      secret !== process.env.OLIVIA_INTEGRATION_SECRET
    ) {
      throw new UnauthorizedException('Invalid integration secret');
    }

    return this.oliviaIntegrationService.createOpportunity(
      (body ?? {}) as OliviaOpportunityPayload,
    );
  }
}
