-- Rename default pipeline "Sales" -> "New Sales" (legacy)
WITH sales AS (
  SELECT p."id", p."tenantId"
  FROM "Pipeline" p
  WHERE p."name" = 'Sales'
    AND NOT EXISTS (
      SELECT 1
      FROM "Pipeline" p2
      WHERE p2."tenantId" = p."tenantId"
        AND p2."name" = 'New Sales'
    )
)
UPDATE "Pipeline" p
SET "name" = 'New Sales',
    "updatedAt" = NOW()
FROM sales s
WHERE p."id" = s."id";

-- Ensure a "Post Sales" pipeline exists for each tenant
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO "Pipeline" ("id", "name", "isDefault", "tenantId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Post Sales', false, t."id", NOW(), NOW()
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM "Pipeline" p
  WHERE p."tenantId" = t."id"
    AND p."name" = 'Post Sales'
);

-- Seed minimal stages for Post Sales pipeline
WITH post_pipelines AS (
  SELECT p."id" AS pipeline_id, p."tenantId" AS tenant_id
  FROM "Pipeline" p
  WHERE p."name" = 'Post Sales'
)
INSERT INTO "Stage" ("id", "name", "position", "probability", "status", "tenantId", "pipelineId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'INVOICE Customer', 1, 1.00, 'OPEN'::"StageStatus", pp.tenant_id, pp.pipeline_id, NOW(), NOW()
FROM post_pipelines pp
WHERE NOT EXISTS (
  SELECT 1 FROM "Stage" s
  WHERE s."tenantId" = pp.tenant_id
    AND s."pipelineId" = pp.pipeline_id
    AND s."name" = 'INVOICE Customer'
);

WITH post_pipelines AS (
  SELECT p."id" AS pipeline_id, p."tenantId" AS tenant_id
  FROM "Pipeline" p
  WHERE p."name" = 'Post Sales'
)
INSERT INTO "Stage" ("id", "name", "position", "probability", "status", "tenantId", "pipelineId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'TRANSFER PAYMENT', 2, 1.00, 'OPEN'::"StageStatus", pp.tenant_id, pp.pipeline_id, NOW(), NOW()
FROM post_pipelines pp
WHERE NOT EXISTS (
  SELECT 1 FROM "Stage" s
  WHERE s."tenantId" = pp.tenant_id
    AND s."pipelineId" = pp.pipeline_id
    AND s."name" = 'TRANSFER PAYMENT'
);

