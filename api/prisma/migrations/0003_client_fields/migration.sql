-- Add additional client contact/billing fields
ALTER TABLE "Client"
ADD COLUMN "website" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "taxId" TEXT;

