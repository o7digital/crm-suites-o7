import { Controller, Get, Post, UseGuards, UploadedFile, UseInterceptors, Body, Param, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { UploadInvoiceDto } from './dto/upload-invoice.dto';
import { Request } from 'express';

const uploadRoot = path.join(process.cwd(), 'uploads');

@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {
    if (!fs.existsSync(uploadRoot)) {
      fs.mkdirSync(uploadRoot, { recursive: true });
    }
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const tenantId = req.user?.tenantId || 'public';
          const dest = path.join(uploadRoot, tenantId);
          fs.mkdirSync(dest, { recursive: true });
          cb(null, dest);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
          cb(null, unique);
        },
      }),
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadInvoiceDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request & { user?: RequestUser },
  ) {
    // tenantId from JWT (RequestUser) preferred
    const effectiveUser = req.user || user;
    return this.invoicesService.storeFile(file, effectiveUser, dto);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.invoicesService.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.invoicesService.findOne(id, user);
  }
}
