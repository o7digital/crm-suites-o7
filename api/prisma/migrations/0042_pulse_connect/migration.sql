BEGIN;
SET LOCAL lock_timeout = '5s';

-- CreateTable
CREATE TABLE "PulseOAuthRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "scopes" TEXT[],
    "state" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "PulseOAuthRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulseOAuthGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scopes" TEXT[],
    "timeZone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PulseOAuthGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulseOAuthCode" (
    "hash" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PulseOAuthCode_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "PulseOAuthToken" (
    "hash" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PulseOAuthToken_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "PulseActionReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PulseActionReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PulseOAuthGrant_userId_tenantId_idx" ON "PulseOAuthGrant"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "PulseOAuthToken_grantId_idx" ON "PulseOAuthToken"("grantId");

-- CreateIndex
CREATE INDEX "PulseActionReceipt_tenantId_userId_createdAt_idx" ON "PulseActionReceipt"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PulseActionReceipt_tenantId_userId_operationId_key" ON "PulseActionReceipt"("tenantId", "userId", "operationId");

-- AddForeignKey
ALTER TABLE "PulseOAuthCode" ADD CONSTRAINT "PulseOAuthCode_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "PulseOAuthGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseOAuthToken" ADD CONSTRAINT "PulseOAuthToken_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "PulseOAuthGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
