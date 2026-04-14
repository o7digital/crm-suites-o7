-- Backfill Post-Sales cases for deals already in WON stages.
INSERT INTO "PostSalesCase" (
  "id",
  "tenantId",
  "clientId",
  "dealId",
  "name",
  "status",
  "priority",
  "ownerUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  d."tenantId",
  d."clientId",
  d."id",
  d."title",
  'onboarding'::"PostSalesCaseStatus",
  'medium'::"PostSalesPriority",
  d."ownerId",
  NOW(),
  NOW()
FROM "Deal" d
JOIN "Stage" s ON s."id" = d."stageId"
LEFT JOIN "PostSalesCase" psc ON psc."dealId" = d."id"
WHERE s."status" = 'WON'::"StageStatus"
  AND psc."id" IS NULL;
