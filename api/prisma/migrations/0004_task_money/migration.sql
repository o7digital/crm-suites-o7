-- Add optional task financial fields
ALTER TABLE "Task"
ADD COLUMN "amount" DECIMAL(12,2),
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';

