-- Post-sales cases pipeline + optional task linkage.

CREATE TYPE "PostSalesCaseStatus" AS ENUM (
  'onboarding',
  'collecting_info',
  'in_progress',
  'waiting_client',
  'internal_review',
  'delivery',
  'support',
  'done'
);

CREATE TYPE "PostSalesPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE "PostSalesCase" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT,
  "dealId" TEXT,
  "name" TEXT NOT NULL,
  "status" "PostSalesCaseStatus" NOT NULL DEFAULT 'onboarding',
  "priority" "PostSalesPriority" NOT NULL DEFAULT 'medium',
  "ownerUserId" TEXT,
  "dueDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PostSalesCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PostSalesCase_dealId_key" ON "PostSalesCase"("dealId");
CREATE INDEX "PostSalesCase_tenantId_idx" ON "PostSalesCase"("tenantId");
CREATE INDEX "PostSalesCase_tenantId_status_idx" ON "PostSalesCase"("tenantId", "status");
CREATE INDEX "PostSalesCase_tenantId_ownerUserId_idx" ON "PostSalesCase"("tenantId", "ownerUserId");
CREATE INDEX "PostSalesCase_clientId_idx" ON "PostSalesCase"("clientId");

ALTER TABLE "PostSalesCase" ADD CONSTRAINT "PostSalesCase_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostSalesCase" ADD CONSTRAINT "PostSalesCase_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PostSalesCase" ADD CONSTRAINT "PostSalesCase_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PostSalesCase" ADD CONSTRAINT "PostSalesCase_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Task" ADD COLUMN "postSalesCaseId" TEXT;
CREATE INDEX "Task_postSalesCaseId_idx" ON "Task"("postSalesCaseId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_postSalesCaseId_fkey"
  FOREIGN KEY ("postSalesCaseId") REFERENCES "PostSalesCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PostSalesCase" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_sales_case_tenant_isolation" ON "PostSalesCase"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL);
