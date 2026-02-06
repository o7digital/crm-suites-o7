-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "StageStatus" NOT NULL DEFAULT 'OPEN',
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "expectedCloseDate" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStageHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pipeline_tenantId_idx" ON "Pipeline"("tenantId");

-- CreateIndex
CREATE INDEX "Stage_pipelineId_idx" ON "Stage"("pipelineId");

-- CreateIndex
CREATE INDEX "Stage_tenantId_idx" ON "Stage"("tenantId");

-- CreateIndex
CREATE INDEX "Deal_pipelineId_idx" ON "Deal"("pipelineId");

-- CreateIndex
CREATE INDEX "Deal_stageId_idx" ON "Deal"("stageId");

-- CreateIndex
CREATE INDEX "Deal_tenantId_idx" ON "Deal"("tenantId");

-- CreateIndex
CREATE INDEX "DealStageHistory_dealId_idx" ON "DealStageHistory"("dealId");

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable Row Level Security (policies aligned with existing tenant scoping)
ALTER TABLE "Pipeline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealStageHistory" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_tenant_isolation" ON "Pipeline"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL);

CREATE POLICY "stage_tenant_isolation" ON "Stage"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL);

CREATE POLICY "deal_tenant_isolation" ON "Deal"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL);

CREATE POLICY "deal_stage_history_tenant_isolation" ON "DealStageHistory"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL);

-- Seed default pipeline and stages for existing tenants
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

WITH inserted AS (
  INSERT INTO "Pipeline" ("id", "name", "isDefault", "tenantId", "createdAt", "updatedAt")
  SELECT gen_random_uuid(), 'Sales', true, t."id", NOW(), NOW()
  FROM "Tenant" t
  WHERE NOT EXISTS (
    SELECT 1 FROM "Pipeline" p WHERE p."tenantId" = t."id"
  )
  RETURNING "id", "tenantId"
)
INSERT INTO "Stage" ("id", "name", "position", "probability", "status", "tenantId", "pipelineId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), s.name, s.position, s.probability, s.status::"StageStatus", i."tenantId", i."id", NOW(), NOW()
FROM inserted i
CROSS JOIN (
  VALUES
    ('Lead', 1, 0.10, 'OPEN'),
    ('Qualified', 2, 0.30, 'OPEN'),
    ('Proposal', 3, 0.50, 'OPEN'),
    ('Negotiation', 4, 0.70, 'OPEN'),
    ('Verbal yes', 5, 0.90, 'OPEN'),
    ('Won', 6, 1.00, 'WON'),
    ('Lost', 7, 0.00, 'LOST')
) AS s(name, position, probability, status);
