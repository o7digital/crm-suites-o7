-- Idempotency ledger for the Olivia One server-to-server opportunity integration
CREATE TABLE "OliviaIntegrationEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sourceMailbox" TEXT NOT NULL,
  "sourceMessageId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "dealId" TEXT,
  "taskIds" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OliviaIntegrationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OliviaIntegrationEvent_sourceMailbox_sourceMessageId_key"
ON "OliviaIntegrationEvent"("sourceMailbox", "sourceMessageId");

CREATE INDEX "OliviaIntegrationEvent_tenantId_idx" ON "OliviaIntegrationEvent"("tenantId");

ALTER TABLE "OliviaIntegrationEvent"
ADD CONSTRAINT "OliviaIntegrationEvent_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
