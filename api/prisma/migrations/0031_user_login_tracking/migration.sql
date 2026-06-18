ALTER TABLE "User"
ADD COLUMN "firstLoginAt" TIMESTAMP(3),
ADD COLUMN "lastLoginAt" TIMESTAMP(3);

UPDATE "User"
SET "firstLoginAt" = COALESCE("firstLoginAt", "createdAt"),
    "lastLoginAt" = COALESCE("lastLoginAt", "updatedAt");
