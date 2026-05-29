import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AcceptLegalDto {
  @IsBoolean()
  accepted: boolean;

  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  contractVersion: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;
}

