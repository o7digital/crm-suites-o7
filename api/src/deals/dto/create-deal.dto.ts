import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

function coerceStringArray(value: unknown): string[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return [trimmed];
  }
  return undefined;
}

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

  @IsOptional()
  @Transform(({ value }) => coerceStringArray(value))
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  productIds?: string[];
}
