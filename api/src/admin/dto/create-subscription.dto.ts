import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO31661Alpha2,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  customerName!: string;

  @IsOptional()
  @IsString()
  @IsISO31661Alpha2()
  customerCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  customerAddress?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactFirstName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactLastName?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['TRIAL', 'PULSE_BASIC', 'PULSE_STANDARD', 'PULSE_ADVANCED', 'PULSE_ADVANCED_PLUS', 'PULSE_TEAM'])
  plan?: 'TRIAL' | 'PULSE_BASIC' | 'PULSE_STANDARD' | 'PULSE_ADVANCED' | 'PULSE_ADVANCED_PLUS' | 'PULSE_TEAM';

  // Number of users allowed for this customer workspace.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  seats?: number;

  @IsOptional()
  @IsString()
  @IsIn(['B2B', 'B2C'])
  crmMode?: 'B2B' | 'B2C';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string | null;

  @IsOptional()
  @IsBoolean()
  conciergeEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  conciergeClientCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  conciergeSiteUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  conciergeInboxUrl?: string | null;
}
