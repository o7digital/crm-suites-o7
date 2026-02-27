import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

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
  @IsInt()
  @Min(1)
  @Max(30)
  seats?: number;
}
