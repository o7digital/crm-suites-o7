import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors, Req } from '@nestjs/common';
import { DealsService } from './deals.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { MoveStageDto } from './dto/move-stage.dto';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import type { Request, Response } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('deals')
export class DealsController {
  constructor(private readonly dealsService: DealsService) {
    if (!fs.existsSync(uploadRoot)) {
      fs.mkdirSync(uploadRoot, { recursive: true });
    }
  }

  @Post(':id/proposal')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const tenantId = (req.user as RequestUser | undefined)?.tenantId || 'public';
          const dest = path.join(uploadRoot, tenantId, 'proposals');
          fs.mkdirSync(dest, { recursive: true });
          cb(null, dest);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
          cb(null, unique);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const ok =
          (file.mimetype || '').toLowerCase() === 'application/pdf' ||
          (file.originalname || '').toLowerCase().endsWith('.pdf');
        cb(ok ? null : new Error('Only PDF files are allowed'), ok);
      },
    }),
  )
  uploadProposal(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
    @Req() req: Request & { user?: RequestUser },
  ) {
    const effectiveUser = req.user || user;
    return this.dealsService.uploadProposal(id, file, effectiveUser);
  }

  @Get(':id/proposal')
  async downloadProposal(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const filePath = await this.dealsService.getProposalFilePath(id, user);
    const fileName = path.basename(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return new StreamableFile(fs.createReadStream(filePath));
  }

  @Post()
  create(@Body() dto: CreateDealDto, @CurrentUser() user: RequestUser) {
    return this.dealsService.create(dto, user);
  }

  @Get()
  findAll(@Query('pipelineId') pipelineId: string | undefined, @CurrentUser() user: RequestUser) {
    return this.dealsService.findAll(pipelineId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.dealsService.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDealDto, @CurrentUser() user: RequestUser) {
    return this.dealsService.update(id, dto, user);
  }

  @Post(':id/move-stage')
  moveStage(@Param('id') id: string, @Body() dto: MoveStageDto, @CurrentUser() user: RequestUser) {
    return this.dealsService.moveStage(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.dealsService.remove(id, user);
  }
}

const uploadRoot = path.join(process.cwd(), 'uploads');
