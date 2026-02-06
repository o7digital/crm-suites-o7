import { IsDateString, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDealDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsNumber()
  value: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsString()
  pipelineId: string;

  @IsOptional()
  @IsString()
  stageId?: string;
}
