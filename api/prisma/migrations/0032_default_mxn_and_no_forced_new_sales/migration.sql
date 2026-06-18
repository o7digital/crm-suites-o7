ALTER TABLE "Tenant"
ALTER COLUMN "crmDisplayCurrency" SET DEFAULT 'MXN';

ALTER TABLE "Deal"
ALTER COLUMN "currency" SET DEFAULT 'MXN';

UPDATE "Tenant"
SET "crmDisplayCurrency" = 'MXN'
WHERE "crmDisplayCurrency" = 'USD';
