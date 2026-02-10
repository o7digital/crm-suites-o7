import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTenantSettingsDto {
  @IsOptional()
  @IsString()
  @IsIn(['B2B', 'B2C'])
  crmMode?: 'B2B' | 'B2C' | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string | null;
}

