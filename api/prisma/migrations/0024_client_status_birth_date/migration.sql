-- Add client lifecycle status and date of birth
ALTER TABLE "Client"
ADD COLUMN "clientStatus" TEXT NOT NULL DEFAULT 'CLIENT',
ADD COLUMN "dateOfBirth" TEXT;
