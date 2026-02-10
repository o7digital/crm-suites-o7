-- Subscription primary contact (who we send the onboarding link to).

ALTER TABLE "Subscription" ADD COLUMN "contactFirstName" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "contactLastName" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "contactEmail" TEXT;

