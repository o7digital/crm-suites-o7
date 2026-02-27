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
  @Matches(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, { message: 'accentColor must be a valid hex color' })
  accentColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, { message: 'accentColor2 must be a valid hex color' })
  accentColor2?: string | null;
}
