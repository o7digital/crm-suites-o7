import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { GoogleCalendarConnectDto } from './dto/google-calendar-connect.dto';
import { GoogleCalendarService } from './google-calendar.service';

@Controller('admin/google-calendar')
export class GoogleCalendarController {
  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  @UseGuards(JwtAuthGuard)
  @Get('status')
  getStatus(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.googleCalendarService.getStatus(user, requestOrigin(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('connect-url')
  createConnectUrl(
    @CurrentUser() user: RequestUser,
    @Body() dto: GoogleCalendarConnectDto,
    @Req() req: Request,
  ) {
    return this.googleCalendarService.createConnectUrl(user, dto.redirectTo, requestOrigin(req));
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const redirectUrl = await this.googleCalendarService.handleOAuthCallback({ code, state, error });
      return res.redirect(redirectUrl);
    } catch (err) {
      return res.redirect(this.googleCalendarService.buildErrorRedirectFromState(state, err));
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('disconnect')
  disconnect(@CurrentUser() user: RequestUser) {
    return this.googleCalendarService.disconnect(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sync-now')
  syncNow(@CurrentUser() user: RequestUser) {
    return this.googleCalendarService.syncNow(user);
  }
}

function requestOrigin(req: Request) {
  const protoHeader = req.headers['x-forwarded-proto'];
  const forwardedProto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const protocol = (forwardedProto || req.protocol || 'http').split(',')[0].trim();
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return `${protocol}://${host}`;
}
