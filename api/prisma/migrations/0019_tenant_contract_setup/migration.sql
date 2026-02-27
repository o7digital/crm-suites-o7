-- Tenant contract extraction setup (template + placeholder to client-field mapping).

ALTER TABLE "Tenant" ADD COLUMN "contractSetup" JSONB;
