BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "recurrenceGroupId" TEXT,
  ADD COLUMN IF NOT EXISTS "recurrenceIndex" INTEGER,
  ADD COLUMN IF NOT EXISTS "recurrenceMonths" INTEGER,
  ADD COLUMN IF NOT EXISTS "recurrenceStartAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recurrenceStageId" TEXT,
  ADD COLUMN IF NOT EXISTS "recurrenceGeneratedThrough" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "Deal_tenantId_recurrenceGroupId_recurrenceIndex_key"
  ON "Deal"("tenantId", "recurrenceGroupId", "recurrenceIndex");

CREATE INDEX IF NOT EXISTS "Deal_recurrenceIndex_recurrenceMonths_idx"
  ON "Deal"("recurrenceIndex", "recurrenceMonths");

COMMIT;
