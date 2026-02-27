import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTenantSettingsDto {
  @IsOptional()
  @IsString()
  @IsIn(['B2B', 'B2C'])
  crmMode?: 'B2B' | 'B2C' | null;

  @IsOptional()
  @IsString()
  @IsIn(['USD', 'EUR', 'MXN', 'CAD'])
  crmDisplayCurrency?: 'USD' | 'EUR' | 'MXN' | 'CAD' | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string | null;

  @IsOptional()
  @IsObject()
  contractSetup?: Record<string, unknown> | null;
}
