import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { UploadInvoiceDto } from './dto/upload-invoice.dto';
import * as path from 'path';
import { Prisma } from '@prisma/client';

interface ExtractionResult {
  amount?: number;
  currency?: string;
  issuedDate?: Date;
  dueDate?: Date;
  notes?: string;
}

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async storeFile(file: Express.Multer.File, user: RequestUser, dto: UploadInvoiceDto) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (dto.clientId) {
      await this.ensureClient(dto.clientId, user);
    }

    const extraction = await this.extract(file.path);
    const amount = dto.amount ? Number(dto.amount) : extraction.amount ?? 0;
    const currency = (dto.currency ?? extraction.currency ?? 'USD').toUpperCase();

    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId: user.tenantId,
        clientId: dto.clientId,
        amount,
        currency,
        filePath: file.path,
        status: 'READY',
        issuedDate: dto.issuedDate ? new Date(dto.issuedDate) : extraction.issuedDate,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : extraction.dueDate,
        extractedRaw: extraction as any,
      },
    });

    return invoice;
  }

  async findAll(user: RequestUser) {
    return this.prisma.invoice.findMany({
      where: { tenantId: user.tenantId },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: RequestUser) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { client: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private async ensureClient(clientId: string, user: RequestUser) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId: user.tenantId } });
    if (!client) throw new NotFoundException('Client not found for this tenant');
  }

  private async extract(filePath: string): Promise<ExtractionResult> {
    // Minimal stub that tries to pick up numbers from the filename for demo purposes.
    const base = path.basename(filePath);
    const match = base.match(/(\d+\.\d{2})/);
    const amount = match ? Number(match[1]) : undefined;

    return {
      amount,
      currency: 'USD',
      issuedDate: new Date(),
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      notes: 'Stub extraction — replace with real LLM or OCR later.',
    };
  }
}
