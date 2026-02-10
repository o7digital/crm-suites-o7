import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { UpdateBrandingDto } from './dto/update-branding.dto';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  private async getUserRole(user: RequestUser): Promise<'OWNER' | 'ADMIN' | 'MEMBER'> {
    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { role: true },
    });
    return (dbUser?.role as 'OWNER' | 'ADMIN' | 'MEMBER' | undefined) ?? 'MEMBER';
  }

  private async ensureAdmin(user: RequestUser) {
    const role = await this.getUserRole(user);
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
  }

  async getBranding(user: RequestUser) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: user.tenantId },
      select: { id: true, name: true, logoDataUrl: true, accentColor: true, accentColor2: true, updatedAt: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      branding: {
        logoDataUrl: tenant.logoDataUrl,
        accentColor: tenant.accentColor,
        accentColor2: tenant.accentColor2,
      },
      updatedAt: tenant.updatedAt,
    };
  }

  async updateBranding(dto: UpdateBrandingDto, user: RequestUser) {
    await this.ensureAdmin(user);

    const normalize = (value: string | null | undefined) => {
      if (value === null) return null;
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };

    const updated = await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        logoDataUrl: normalize(dto.logoDataUrl),
        accentColor: normalize(dto.accentColor),
        accentColor2: normalize(dto.accentColor2),
      },
      select: { id: true, name: true, logoDataUrl: true, accentColor: true, accentColor2: true, updatedAt: true },
    });

    return {
      tenantId: updated.id,
      tenantName: updated.name,
      branding: {
        logoDataUrl: updated.logoDataUrl,
        accentColor: updated.accentColor,
        accentColor2: updated.accentColor2,
      },
      updatedAt: updated.updatedAt,
    };
  }
}

