-- Add post-sales stages after WON for existing pipelines
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

WITH won_stage AS (
  SELECT s."id" AS won_id, s."tenantId", s."pipelineId", s."position" AS won_pos
  FROM "Stage" s
  WHERE s."name" = 'Won'
),
move_lost AS (
  UPDATE "Stage" s
  SET "position" = ws.won_pos + 3,
      "updatedAt" = NOW()
  FROM won_stage ws
  WHERE s."tenantId" = ws."tenantId"
    AND s."pipelineId" = ws."pipelineId"
    AND s."name" = 'Lost'
    AND s."position" <= ws.won_pos + 2
  RETURNING s."id"
)
INSERT INTO "Stage" ("id", "name", "position", "probability", "status", "tenantId", "pipelineId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'INVOICE Customer', ws.won_pos + 1, 1.00, 'WON'::"StageStatus", ws."tenantId", ws."pipelineId", NOW(), NOW()
FROM won_stage ws
WHERE NOT EXISTS (
  SELECT 1 FROM "Stage" s
  WHERE s."tenantId" = ws."tenantId"
    AND s."pipelineId" = ws."pipelineId"
    AND s."name" = 'INVOICE Customer'
);

INSERT INTO "Stage" ("id", "name", "position", "probability", "status", "tenantId", "pipelineId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'TRANSFER PAYMENT', ws.won_pos + 2, 1.00, 'WON'::"StageStatus", ws."tenantId", ws."pipelineId", NOW(), NOW()
FROM won_stage ws
WHERE NOT EXISTS (
  SELECT 1 FROM "Stage" s
  WHERE s."tenantId" = ws."tenantId"
    AND s."pipelineId" = ws."pipelineId"
    AND s."name" = 'TRANSFER PAYMENT'
);

