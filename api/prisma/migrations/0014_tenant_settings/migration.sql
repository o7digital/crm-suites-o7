-- Tenant-level CRM setup fields (B2B/B2C mode + industry)

ALTER TABLE "Tenant" ADD COLUMN "crmMode" TEXT NOT NULL DEFAULT 'B2B';
ALTER TABLE "Tenant" ADD COLUMN "industry" TEXT;

