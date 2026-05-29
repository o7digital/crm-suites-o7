CREATE TABLE "LegalAcceptance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "contractVersion" TEXT NOT NULL,
  "country" TEXT,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "source" TEXT NOT NULL DEFAULT 'SIGNUP',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LegalAcceptance_tenantId_idx" ON "LegalAcceptance"("tenantId");
CREATE INDEX "LegalAcceptance_email_idx" ON "LegalAcceptance"("email");
CREATE INDEX "LegalAcceptance_contractVersion_idx" ON "LegalAcceptance"("contractVersion");

ALTER TABLE "LegalAcceptance"
ADD CONSTRAINT "LegalAcceptance_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LegalAcceptance"
ADD CONSTRAINT "LegalAcceptance_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

