import type { RequestUser } from '../common/user.decorator';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import { PulseOAuthService } from './oauth.service';

@Controller('.well-known')
export class PulseMetadataController {
  constructor(private readonly oauth: PulseOAuthService) {}
  @Get('oauth-authorization-server') metadata() {
    return this.oauth.metadata();
  }
  @Get('oauth-protected-resource/api/mcp') protectedMetadata() {
    return this.oauth.protectedMetadata();
  }
  @Get('oauth-protected-resource') protectedRoot() {
    return this.oauth.protectedMetadata();
  }
}

@Controller('oauth')
export class PulseOAuthController {
  constructor(private readonly oauth: PulseOAuthService) {}
  @Get('authorize')
  async authorize(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(await this.oauth.begin(query));
  }
  @Post('token')
  @HttpCode(200)
  token(
    @Body() body: Record<string, string>,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    return this.oauth.exchange(body);
  }
  @Post('revoke')
  @HttpCode(200)
  revoke(@Body() body: Record<string, string>) {
    return this.oauth.revokeToken(body);
  }
  @Get('requests/:id')
  @UseGuards(JwtAuthGuard)
  preview(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.oauth.preview(id, user);
  }
  @Post('requests/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  consent(
    @Param('id') id: string,
    @Body() body: { allow: boolean; write?: boolean; timeZone?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.oauth.consent(id, body, user);
  }
  @Get('connections')
  @UseGuards(JwtAuthGuard)
  connections(@CurrentUser() user: RequestUser) {
    return this.oauth.connections(user);
  }
  @Post('connections/:id/revoke')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  revokeConnection(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.oauth.revokeConnection(id, user);
  }
}
