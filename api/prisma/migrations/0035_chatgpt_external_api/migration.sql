-- Read-only external API credentials and audit trail.
-- Raw API keys are never stored: only SHA-256 hashes and non-secret key ids.
CREATE TABLE "ExternalApiCredential" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'CHATGPT',
  "keyId" TEXT NOT NULL,
  "apiKeyHash" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "scopes" TEXT[] NOT NULL,
  "lastAccessAt" TIMESTAMP(3),
  "rotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalApiCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalApiAccessLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "apiKeyId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "statusHttp" INTEGER NOT NULL,
  "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalApiAccessLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalApiCredential_keyId_key" ON "ExternalApiCredential"("keyId");
CREATE UNIQUE INDEX "ExternalApiCredential_tenantId_provider_key" ON "ExternalApiCredential"("tenantId", "provider");
CREATE INDEX "ExternalApiCredential_tenantId_idx" ON "ExternalApiCredential"("tenantId");
CREATE INDEX "ExternalApiAccessLog_tenantId_accessedAt_idx" ON "ExternalApiAccessLog"("tenantId", "accessedAt");
CREATE INDEX "ExternalApiAccessLog_apiKeyId_idx" ON "ExternalApiAccessLog"("apiKeyId");

ALTER TABLE "ExternalApiCredential"
ADD CONSTRAINT "ExternalApiCredential_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalApiAccessLog"
ADD CONSTRAINT "ExternalApiAccessLog_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
