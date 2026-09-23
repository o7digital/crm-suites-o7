-- CreateTable
CREATE TABLE "KabinVehicle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT,
    "modelYear" INTEGER,
    "armorLevel" TEXT,
    "description" TEXT,
    "specifications" JSONB,
    "imageUrl" TEXT,
    "priceMxn" DECIMAL(14,2),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KabinVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KabinApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "vehicleId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "amountMxn" DECIMAL(14,2),
    "downPercent" INTEGER,
    "termMonths" INTEGER,
    "annualRate" DECIMAL(6,2),
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KabinApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KabinVehicle_tenantId_status_sortOrder_idx" ON "KabinVehicle"("tenantId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "KabinApplication_tenantId_status_createdAt_idx" ON "KabinApplication"("tenantId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "KabinVehicle" ADD CONSTRAINT "KabinVehicle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KabinApplication" ADD CONSTRAINT "KabinApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KabinApplication" ADD CONSTRAINT "KabinApplication_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KabinApplication" ADD CONSTRAINT "KabinApplication_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "KabinVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

