import { IsDateString, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDealDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsNumber()
  value?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;
}
