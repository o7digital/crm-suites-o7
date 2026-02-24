import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class LeadAnalysisDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Transform(({ value }) => trimString(value))
  dealId: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  @Transform(({ value }) => trimString(value))
  context?: string;
}
