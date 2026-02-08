import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function optionalUpperCurrency(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.toUpperCase();
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return Number(trimmed);
}

export class CreateProductDto {
  @IsString()
  @MaxLength(160)
  @Transform(({ value }) => trimString(value))
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => trimString(value))
  description?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @Transform(({ value }) => optionalUpperCurrency(value))
  @IsIn(['USD', 'EUR', 'MXN', 'CAD'])
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

