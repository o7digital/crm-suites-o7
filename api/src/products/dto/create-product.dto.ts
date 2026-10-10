import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  Validate,
} from 'class-validator';
import { PRODUCT_FIELD_TYPES, ProductFieldValueValidator } from './product-field-value.validator';
import type { ProductFieldType } from './product-field-value.validator';

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

function optionalNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return Number(trimmed);
}

export class ProductExtraFieldDto {
  @IsOptional()
  @IsIn(PRODUCT_FIELD_TYPES)
  type?: ProductFieldType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value.map(trimString) : value))
  options?: string[];

  @IsString()
  @Transform(({ value }) => trimString(value))
  @MinLength(1)
  @MaxLength(100)
  label: string;

  @IsString()
  @MaxLength(2000)
  @Validate(ProductFieldValueValidator)
  value: string;
}

export class CreateProductDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ProductExtraFieldDto)
  extraFields?: ProductExtraFieldDto[];

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
