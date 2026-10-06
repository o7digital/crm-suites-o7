-- Additive signature storage. No legacy tables or data are changed.
CREATE TABLE IF NOT EXISTS "SignatureEnvelope" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "SignatureEnvelope_tenant_created_idx" ON "SignatureEnvelope"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SignatureEnvelope_recipient_tokens_idx" ON "SignatureEnvelope" USING GIN (("data"->'recipients'));
