import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  customerName!: string;

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
  @IsIn(['B2B', 'B2C'])
  crmMode?: 'B2B' | 'B2C';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string | null;
}
