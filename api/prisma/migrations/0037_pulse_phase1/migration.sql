-- Additive migration: no legacy rows are rewritten or removed.
-- Fail fast rather than waiting indefinitely for locks on a busy database.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
ALTER TABLE "Task"
  ADD COLUMN "assigneeId" TEXT,
  ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "opportunityId" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Deal"
  ADD COLUMN "lastActivityAt" TIMESTAMP(3),
  ADD COLUMN "nextActionAt" TIMESTAMP(3),
  ADD COLUMN "boardOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Task_tenantId_status_dueDate_idx" ON "Task"("tenantId", "status", "dueDate");
CREATE INDEX "Task_tenantId_assigneeId_idx" ON "Task"("tenantId", "assigneeId");
CREATE INDEX "Task_opportunityId_idx" ON "Task"("opportunityId");
CREATE INDEX "Deal_tenantId_status_nextActionAt_idx" ON "Deal"("tenantId", "status", "nextActionAt");
CREATE INDEX "Deal_tenantId_status_lastActivityAt_idx" ON "Deal"("tenantId", "status", "lastActivityAt");
CREATE INDEX "Deal_tenantId_stageId_boardOrder_idx" ON "Deal"("tenantId", "stageId", "boardOrder");
CREATE TABLE "DealActivity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DealActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DealActivity_tenantId_dealId_createdAt_idx" ON "DealActivity"("tenantId", "dealId", "createdAt");
COMMIT;
