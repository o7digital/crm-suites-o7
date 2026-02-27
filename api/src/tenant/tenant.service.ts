import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { UpdateTenantSettingsDto } from './dto/update-settings.dto';

type ContractClientFieldKey =
  | 'firstName'
  | 'name'
  | 'function'
  | 'companySector'
  | 'email'
  | 'phone'
  | 'company'
  | 'website'
  | 'address'
  | 'taxId'
  | 'notes';

type ContractFieldMapping = {
  placeholder: string;
  clientField: ContractClientFieldKey;
  label?: string;
};

type ContractSetup = {
  templateHref: string;
  fieldMappings: ContractFieldMapping[];
};

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}
  private readonly crmDisplayCurrencies = ['USD', 'EUR', 'MXN', 'CAD'] as const;
  private readonly allowedContractClientFields = new Set<ContractClientFieldKey>([
    'firstName',
    'name',
    'function',
    'companySector',
    'email',
    'phone',
    'company',
    'website',
    'address',
    'taxId',
    'notes',
  ]);

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
    try {
      const dbUser = await this.prisma.user.findFirst({
        where: { id: user.userId, tenantId: user.tenantId },
        select: { role: true },
      });
      return (dbUser?.role as 'OWNER' | 'ADMIN' | 'MEMBER' | undefined) ?? 'MEMBER';
    } catch (err) {
      const mapped = this.mapSchemaError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  private async ensureAdmin(user: RequestUser) {
    const role = await this.getUserRole(user);
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
  }

  private sanitizeContractSetup(raw: unknown): ContractSetup | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    if (typeof raw !== 'object') return null;

    const obj = raw as Record<string, unknown>;
    const templateHref = String(obj.templateHref || '').trim();
    if (!templateHref) return null;
    if (templateHref.length > 240) return null;

    const rawMappings = Array.isArray(obj.fieldMappings) ? obj.fieldMappings : [];
    const fieldMappings: ContractFieldMapping[] = [];
    const seenPlaceholders = new Set<string>();

    for (const entry of rawMappings) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      const placeholder = String(item.placeholder || '').trim();
      const clientField = String(item.clientField || '').trim() as ContractClientFieldKey;
      const labelRaw = String(item.label || '').trim();

      if (!/^[a-zA-Z0-9_]{1,80}$/.test(placeholder)) continue;
      if (!this.allowedContractClientFields.has(clientField)) continue;
      if (seenPlaceholders.has(placeholder)) continue;

      seenPlaceholders.add(placeholder);
      fieldMappings.push({
        placeholder,
        clientField,
        ...(labelRaw ? { label: labelRaw.slice(0, 120) } : {}),
      });
    }

    return {
      templateHref,
      fieldMappings,
    };
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
        select: {
          id: true,
          name: true,
          crmMode: true,
          crmDisplayCurrency: true,
          industry: true,
          contractSetup: true,
          updatedAt: true,
        },
      });
      if (!tenant) throw new NotFoundException('Tenant not found');
      const currency = String(tenant.crmDisplayCurrency || 'USD').toUpperCase();
      const crmDisplayCurrency = this.crmDisplayCurrencies.includes(currency as (typeof this.crmDisplayCurrencies)[number])
        ? (currency as (typeof this.crmDisplayCurrencies)[number])
        : 'USD';
      const contractSetup = this.sanitizeContractSetup(tenant.contractSetup);
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        settings: {
          crmMode: (tenant.crmMode || 'B2B') as 'B2B' | 'B2C',
          crmDisplayCurrency,
          industry: tenant.industry ?? null,
          contractSetup: contractSetup ?? null,
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
    const nextCrmDisplayCurrency = dto.crmDisplayCurrency
      ? String(dto.crmDisplayCurrency).toUpperCase()
      : undefined;
    const nextContractSetup = this.sanitizeContractSetup(dto.contractSetup);

    try {
      const updated = await this.prisma.tenant.update({
        where: { id: user.tenantId },
        data: {
          crmMode: nextCrmMode,
          crmDisplayCurrency: nextCrmDisplayCurrency,
          industry: normalize(dto.industry),
          ...(nextContractSetup !== undefined
            ? {
                contractSetup:
                  nextContractSetup === null
                    ? Prisma.DbNull
                    : (nextContractSetup as Prisma.InputJsonValue),
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          crmMode: true,
          crmDisplayCurrency: true,
          industry: true,
          contractSetup: true,
          updatedAt: true,
        },
      });

      // Keep pipeline default aligned with the tenant mode when possible.
      await this.enforceDefaultPipeline(updated.id, updated.crmMode || 'B2B');

      const currency = String(updated.crmDisplayCurrency || 'USD').toUpperCase();
      const crmDisplayCurrency = this.crmDisplayCurrencies.includes(currency as (typeof this.crmDisplayCurrencies)[number])
        ? (currency as (typeof this.crmDisplayCurrencies)[number])
        : 'USD';
      const contractSetup = this.sanitizeContractSetup(updated.contractSetup);

      return {
        tenantId: updated.id,
        tenantName: updated.name,
        settings: {
          crmMode: (updated.crmMode || 'B2B') as 'B2B' | 'B2C',
          crmDisplayCurrency,
          industry: updated.industry ?? null,
          contractSetup: contractSetup ?? null,
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
