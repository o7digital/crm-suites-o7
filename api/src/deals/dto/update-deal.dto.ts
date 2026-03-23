import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

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

  @IsOptional()
  @IsString()
  pipelineId?: string;

  @IsOptional()
  @IsString()
  stageId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  probability?: number | null;

  @IsOptional()
  @IsUUID('4')
  clientId?: string | null;
}
