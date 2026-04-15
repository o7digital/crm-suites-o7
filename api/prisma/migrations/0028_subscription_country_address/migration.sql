ALTER TABLE "Subscription"
ADD COLUMN IF NOT EXISTS "customerCountry" TEXT,
ADD COLUMN IF NOT EXISTS "customerAddress" TEXT;
