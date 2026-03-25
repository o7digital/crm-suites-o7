-- Add collaborator contacts linked to CRM clients
CREATE TABLE "ClientCollaborator" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "firstName" TEXT,
  "name" TEXT NOT NULL,
  "function" TEXT,
  "email" TEXT,
  "whatsapp" TEXT,
  "comments" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientCollaborator_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientCollaborator_tenantId_idx" ON "ClientCollaborator"("tenantId");
CREATE INDEX "ClientCollaborator_clientId_idx" ON "ClientCollaborator"("clientId");
CREATE INDEX "ClientCollaborator_tenantId_clientId_idx" ON "ClientCollaborator"("tenantId", "clientId");

ALTER TABLE "ClientCollaborator"
ADD CONSTRAINT "ClientCollaborator_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "ClientCollaborator"
ADD CONSTRAINT "ClientCollaborator_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
