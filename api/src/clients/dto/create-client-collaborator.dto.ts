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

  const angle = raw.match(/^\s*"?([^"<]+?)"?\s*<\s*([^>]+)\s*>\s*$/);
  if (angle) {
    const extracted = optionalTrimmedString(angle[2]);
    if (extracted) return extracted;
  }

  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) return emailMatch[0].trim();

  return raw;
}

export class CreateClientCollaboratorDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => optionalTrimmedString(value))
  firstName?: string;

  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => optionalTrimmedString(value))
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => optionalTrimmedString(value))
  function?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => optionalTrimmedString(value))
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Transform(({ value }) => optionalTrimmedString(value))
  comments?: string;
}
