import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  customerName!: string;

  @IsOptional()
  @IsString()
  @IsIn(['B2B', 'B2C'])
  crmMode?: 'B2B' | 'B2C';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string | null;
}
