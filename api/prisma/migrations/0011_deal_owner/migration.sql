-- Add deal ownership (ownerId) so MEMBERS only see their own leads.

ALTER TABLE "Deal" ADD COLUMN "ownerId" TEXT;

-- Backfill existing deals to the tenant OWNER (or first user if no owner exists).
UPDATE "Deal" d
SET "ownerId" = COALESCE(
  (SELECT u.id FROM "User" u WHERE u."tenantId" = d."tenantId" AND u.role = 'OWNER'::"UserRole" ORDER BY u."createdAt" ASC LIMIT 1),
  (SELECT u.id FROM "User" u WHERE u."tenantId" = d."tenantId" ORDER BY u."createdAt" ASC LIMIT 1)
)
WHERE d."ownerId" IS NULL;

CREATE INDEX "Deal_ownerId_idx" ON "Deal"("ownerId");

ALTER TABLE "Deal" ADD CONSTRAINT "Deal_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

