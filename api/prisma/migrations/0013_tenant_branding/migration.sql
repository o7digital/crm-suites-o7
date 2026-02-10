-- Tenant branding ("Featured & Skin"): logo + accent colors.

ALTER TABLE "Tenant" ADD COLUMN "logoDataUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "accentColor" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "accentColor2" TEXT;

