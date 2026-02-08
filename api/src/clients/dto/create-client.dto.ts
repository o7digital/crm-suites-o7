import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

function optionalTrimmedString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeEmail(value: unknown): string | undefined {
  const raw = optionalTrimmedString(value);
  if (!raw) return undefined;

  // Common copy/paste format: `Full Name <email@domain>`
  const angle = raw.match(/^\s*"?([^"<]+?)"?\s*<\s*([^>]+)\s*>\s*$/);
  if (angle) {
    const extracted = optionalTrimmedString(angle[2]);
    if (extracted) return extracted;
  }

  // Fallback: extract first email-like token from any string.
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) return emailMatch[0].trim();

  return raw;
}

export class CreateClientDto {
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => optionalTrimmedString(value))
  name: string;

  @IsOptional()
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => optionalTrimmedString(value))
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => optionalTrimmedString(value))
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(({ value }) => optionalTrimmedString(value))
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(({ value }) => optionalTrimmedString(value))
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => optionalTrimmedString(value))
  taxId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => optionalTrimmedString(value))
  notes?: string;
}
