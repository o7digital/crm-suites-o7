import { Module } from '@nestjs/common';
import { SignaturesService } from './signatures.service';
import { SignaturePdfService } from './signature-pdf.service';
import { SignatureMailService } from './signature-mail.service';
import {
  SignaturesController,
  SignaturePublicController,
} from './signatures.controller';
@Module({
  controllers: [SignaturePublicController, SignaturesController],
  providers: [SignaturesService, SignaturePdfService, SignatureMailService],
})
export class SignaturesModule {}
