ALTER TABLE "Subscription"
ADD COLUMN "conciergeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "conciergeClientCode" TEXT,
ADD COLUMN "conciergeSiteUrl" TEXT,
ADD COLUMN "conciergeInboxUrl" TEXT;

CREATE UNIQUE INDEX "Subscription_conciergeClientCode_key"
ON "Subscription"("conciergeClientCode");
