import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// Lightweight tenant-level branding ("Featured & Skin") settings.
export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  // 800 KB image files become ~1.1 MB once base64-encoded in a data URL.
  @MaxLength(1_200_000)
  logoDataUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, { message: 'backgroundColor must be a valid hex color' })
  backgroundColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, { message: 'surfaceColor must be a valid hex color' })
  surfaceColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, { message: 'cardColor must be a valid hex color' })
  cardColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, { message: 'foregroundColor must be a valid hex color' })
  foregroundColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, { message: 'mutedColor must be a valid hex color' })
  mutedColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, { message: 'accentColor must be a valid hex color' })
  accentColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, { message: 'accentColor2 must be a valid hex color' })
  accentColor2?: string | null;
}
