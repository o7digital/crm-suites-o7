-- Tenant CRM display currency (used for board totals rendering).

ALTER TABLE "Tenant" ADD COLUMN "crmDisplayCurrency" TEXT NOT NULL DEFAULT 'USD';
