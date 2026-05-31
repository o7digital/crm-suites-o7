import { Body, Controller, Headers, Ip, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AcceptLegalDto } from './dto/accept-legal.dto';
import { LegalService } from './legal.service';

@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Post('accept')
  accept(
    @Body() dto: AcceptLegalDto,
    @Ip() ip: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() req: Request,
  ) {
    const forwardedFor = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    return this.legalService.accept(dto, {
      ipAddress: forwardedFor || ip || null,
      userAgent: userAgent || null,
    });
  }
}

