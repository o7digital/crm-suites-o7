DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'DealLossReason' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "DealLossReason" AS ENUM (
      'price',
      'no_response',
      'competitor',
      'budget',
      'project_cancelled',
      'timing',
      'other'
    );
  END IF;
END $$;

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "status" "StageStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closeNote" TEXT,
  ADD COLUMN IF NOT EXISTS "lossReason" "DealLossReason",
  ADD COLUMN IF NOT EXISTS "lossComment" TEXT,
  ADD COLUMN IF NOT EXISTS "followUpAt" TIMESTAMP(3);

UPDATE "Deal" AS deal
SET
  "status" = stage."status",
  "closedAt" = CASE
    WHEN stage."status" IN ('WON', 'LOST') THEN COALESCE(deal."closedAt", deal."updatedAt")
    ELSE NULL
  END
FROM "Stage" AS stage
WHERE deal."stageId" = stage."id";

CREATE INDEX IF NOT EXISTS "Deal_tenantId_pipelineId_status_idx"
  ON "Deal"("tenantId", "pipelineId", "status");

CREATE INDEX IF NOT EXISTS "Deal_tenantId_closedAt_idx"
  ON "Deal"("tenantId", "closedAt");
