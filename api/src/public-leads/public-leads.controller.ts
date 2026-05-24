import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { PublicLeadsService } from './public-leads.service';

@Controller('public/o7digital/leads')
export class PublicLeadsController {
  constructor(private readonly publicLeadsService: PublicLeadsService) {}

  @Post()
  create(@Body() body: unknown, @Headers('x-o7-webhook-secret') secret?: string) {
    if (!process.env.O7_PUBLIC_LEADS_SECRET || secret !== process.env.O7_PUBLIC_LEADS_SECRET) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    return this.publicLeadsService.createO7Lead((body ?? {}) as Record<string, unknown>);
  }
}
