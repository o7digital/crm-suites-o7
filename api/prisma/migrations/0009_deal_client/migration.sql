-- Add optional client relation on deals

ALTER TABLE "Deal" ADD COLUMN "clientId" TEXT;

CREATE INDEX "Deal_clientId_idx" ON "Deal"("clientId");

ALTER TABLE "Deal" ADD CONSTRAINT "Deal_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

