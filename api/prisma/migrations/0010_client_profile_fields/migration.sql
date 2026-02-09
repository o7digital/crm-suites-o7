-- Add additional client profile fields
ALTER TABLE "Client"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "function" TEXT,
ADD COLUMN "companySector" TEXT;

