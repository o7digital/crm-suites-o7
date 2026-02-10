import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { UpdateTenantSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  private mapSchemaError(err: unknown): ServiceUnavailableException | null {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Common Prisma codes when tables/columns are missing because migrations haven't run yet.
      if (err.code === 'P2021' || err.code === 'P2022') {
        return new ServiceUnavailableException(
          'Database schema upgrade pending. Redeploy the API (or run migrations), then retry.',
        );
      }
    }
    return null;
  }

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
    try {
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
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  async updateBranding(dto: UpdateBrandingDto, user: RequestUser) {
    await this.ensureAdmin(user);

    const normalize = (value: string | null | undefined) => {
      if (value === null) return null;
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };

    try {
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
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  async getSettings(user: RequestUser) {
    try {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: user.tenantId },
        select: { id: true, name: true, crmMode: true, industry: true, updatedAt: true },
      });
      if (!tenant) throw new NotFoundException('Tenant not found');
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        settings: {
          crmMode: (tenant.crmMode || 'B2B') as 'B2B' | 'B2C',
          industry: tenant.industry ?? null,
        },
        updatedAt: tenant.updatedAt,
      };
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  async updateSettings(dto: UpdateTenantSettingsDto, user: RequestUser) {
    await this.ensureAdmin(user);

    const normalize = (value: string | null | undefined) => {
      if (value === null) return null;
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };

    const nextCrmMode = dto.crmMode === 'B2B' || dto.crmMode === 'B2C' ? dto.crmMode : undefined;

    try {
      const updated = await this.prisma.tenant.update({
        where: { id: user.tenantId },
        data: {
          crmMode: nextCrmMode,
          industry: normalize(dto.industry),
        },
        select: { id: true, name: true, crmMode: true, industry: true, updatedAt: true },
      });

      // Keep pipeline default aligned with the tenant mode when possible.
      await this.enforceDefaultPipeline(updated.id, updated.crmMode || 'B2B');

      return {
        tenantId: updated.id,
        tenantName: updated.name,
        settings: {
          crmMode: (updated.crmMode || 'B2B') as 'B2B' | 'B2C',
          industry: updated.industry ?? null,
        },
        updatedAt: updated.updatedAt,
      };
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  private async enforceDefaultPipeline(tenantId: string, crmMode: string) {
    const desiredName = crmMode === 'B2C' ? 'B2C' : 'New Sales';
    const desired = await this.prisma.pipeline.findFirst({
      where: { tenantId, name: desiredName },
      select: { id: true },
    });
    if (!desired) return;

    await this.prisma.pipeline.updateMany({ where: { tenantId }, data: { isDefault: false } });
    await this.prisma.pipeline.update({ where: { id: desired.id }, data: { isDefault: true } });
  }
}
