import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Headers,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { SignaturesService } from './signatures.service';

function pdf(res: Response, bytes: Buffer) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.send(bytes);
}
@UseGuards(JwtAuthGuard)
@Controller('signatures')
export class SignaturesController {
  constructor(private signatures: SignaturesService) {}
  @Get('settings') settings(@CurrentUser() user: RequestUser) {
    return this.signatures.settings(user);
  }
  @Get() list(@CurrentUser() user: RequestUser) {
    return this.signatures.list(user);
  }
  @Post() create(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.signatures.create(body, user);
  }
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3 },
    }),
  )
  upload(
    @Body() body: unknown,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.signatures.create(body, user, file);
  }
  @Get(':id') get(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.signatures.get(id, user);
  }
  @Patch(':id') update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: RequestUser,
  ) {
    return this.signatures.update(id, body, user);
  }
  @Post(':id/send') send(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.signatures.send(id, user);
  }
  @Post(':id/resend') resend(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.signatures.send(id, user, true);
  }
  @Post(':id/resend-completed') resendCompleted(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.signatures.resendCompleted(id, user);
  }
  @Post(':id/void') void(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.signatures.void(id, user);
  }
  @Get(':id/pdf') async download(
    @Param('id') id: string,
    @Query('signed') signed: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    pdf(res, await this.signatures.ownerPdf(id, user, signed === 'true'));
  }
  @Get(':id/audit') log(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.signatures.ownerAudit(id, user);
  }
}
@Controller('signatures/public')
export class SignaturePublicController {
  constructor(private signatures: SignaturesService) {}
  @Get(':token') landing(@Param('token') token: string) {
    return this.signatures.landing(token);
  }
  @Post(':token/code') code(
    @Param('token') token: string,
    @Req() req: Request,
  ) {
    return this.signatures.requestCode(
      token,
      req.ip || req.socket.remoteAddress || '',
    );
  }
  @Post(':token/verify') verify(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    return this.signatures.verify(
      token,
      body,
      req.ip || req.socket.remoteAddress || '',
    );
  }
  @Get(':token/document') document(
    @Param('token') token: string,
    @Headers('x-signing-session') session: string,
  ) {
    return this.signatures.signerDocument(token, session);
  }
  @Get(':token/pdf') async download(
    @Param('token') token: string,
    @Headers('x-signing-session') session: string,
    @Query('signed') signed: string,
    @Res() res: Response,
  ) {
    pdf(
      res,
      await this.signatures.signerPdf(token, session, signed === 'true'),
    );
  }
  @Post(':token/sign') sign(
    @Param('token') token: string,
    @Headers('x-signing-session') session: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    return this.signatures.sign(
      token,
      session,
      body,
      req.ip || req.socket.remoteAddress || '',
    );
  }
}
