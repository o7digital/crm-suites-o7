import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @IsOptional()
  @IsString()
  @IsISO31661Alpha2()
  customerCountry?: string | null;

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

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  seats?: number;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  trialEndsAt?: string | null;

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
