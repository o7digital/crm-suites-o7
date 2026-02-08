-- Create Product and DealItem models for CRM product selection
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DealItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealItem_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");
CREATE INDEX "DealItem_tenantId_idx" ON "DealItem"("tenantId");
CREATE INDEX "DealItem_dealId_idx" ON "DealItem"("dealId");
CREATE INDEX "DealItem_productId_idx" ON "DealItem"("productId");
CREATE UNIQUE INDEX "DealItem_dealId_productId_key" ON "DealItem"("dealId", "productId");

-- Foreign keys
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Optional row-level security (aligned with existing tenant scoping strategy)
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealItem" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_tenant_isolation" ON "Product"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL);

CREATE POLICY "deal_item_tenant_isolation" ON "DealItem"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL);

