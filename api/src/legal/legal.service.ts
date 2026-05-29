import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptLegalDto } from './dto/accept-legal.dto';

@Injectable()
export class LegalService {
  constructor(private prisma: PrismaService) {}

  async accept(dto: AcceptLegalDto, reqMeta: { ipAddress?: string | null; userAgent?: string | null }) {
    if (!dto.accepted) {
      throw new BadRequestException('Legal acceptance is required');
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: dto.tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const normalizedEmail = dto.email.trim().toLowerCase();
    const normalizedCountry = dto.country?.trim().toUpperCase() || null;
    const source = dto.source?.trim().toUpperCase() || 'SIGNUP';

    const user = await this.prisma.user.findFirst({
      where: { tenantId: dto.tenantId, email: normalizedEmail },
      select: { id: true },
    });

    return this.prisma.legalAcceptance.create({
      data: {
        tenantId: dto.tenantId,
        userId: user?.id ?? null,
        email: normalizedEmail,
        contractVersion: dto.contractVersion.trim(),
        country: normalizedCountry,
        ipAddress: reqMeta.ipAddress || null,
        userAgent: reqMeta.userAgent || null,
        source,
      },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        email: true,
        contractVersion: true,
        country: true,
        acceptedAt: true,
        source: true,
      },
    });
  }
}

