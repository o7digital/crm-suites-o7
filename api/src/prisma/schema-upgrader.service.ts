import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class SchemaUpgraderService {
  constructor(private prisma: PrismaService) {}

  // Best-effort, idempotent schema upgrades for production drift.
  // This keeps the API functional even if Prisma Migrate is blocked.
  async run() {
    await this.ensureUserRoleSchema();
    await this.ensureDealClientId();
    await this.ensureDealOwnerId();
    await this.ensureDealProposalFields();
    await this.ensureProductsSchema();
    await this.ensureClientProfileFields();
    await this.ensureSubscriptionsSchema();
    await this.ensureTenantBrandingFields();
    await this.ensureTenantCrmSettingsFields();
  }

  private async tableExists(table: string) {
    const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ${table}
      ) AS exists
    `;
    return Boolean(rows[0]?.exists);
  }

  private async columnExists(table: string, column: string) {
    const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${table}
          AND column_name = ${column}
      ) AS exists
    `;
    return Boolean(rows[0]?.exists);
  }

  private async constraintExists(constraintName: string) {
    const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND constraint_name = ${constraintName}
      ) AS exists
    `;
    return Boolean(rows[0]?.exists);
  }

  private async ensureDealClientId() {
    const hasClientId = await this.columnExists('Deal', 'clientId');
    if (!hasClientId) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "Deal" ADD COLUMN "clientId" TEXT;`);
    }

    // Idempotent index creation.
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Deal_clientId_idx" ON "Deal"("clientId");`,
    );

    const fkName = 'Deal_clientId_fkey';
    const fkExists = await this.constraintExists(fkName);
    if (!fkExists) {
      try {
        await this.prisma.$executeRawUnsafe(`
          ALTER TABLE "Deal"
          ADD CONSTRAINT "${fkName}"
          FOREIGN KEY ("clientId") REFERENCES "Client"("id")
          ON DELETE SET NULL
          ON UPDATE CASCADE;
        `);
      } catch {
        // Ignore if the constraint already exists under a different name.
      }
    }
  }

  private async ensureUserRoleSchema() {
    const hasUser = await this.tableExists('User');
    if (!hasUser) return;

    const hasRole = await this.columnExists('User', 'role');
    if (hasRole) return;

    // Create enum if missing (no IF NOT EXISTS for CREATE TYPE in Postgres).
    await this.prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'UserRole' AND n.nspname = 'public'
        ) THEN
          CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
        END IF;
      END $$;
    `);

    try {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'MEMBER';`,
      );
    } catch {
      // Ignore permissions / already-added races.
    }
  }

  private async ensureDealOwnerId() {
    const hasOwnerId = await this.columnExists('Deal', 'ownerId');
    if (!hasOwnerId) {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "Deal" ADD COLUMN "ownerId" TEXT;`);
    }

    // Backfill existing deals to the tenant OWNER (or first user if no owner exists).
    const hasUserRole = await this.columnExists('User', 'role');
    if (hasUserRole) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "Deal" d
        SET "ownerId" = COALESCE(
          (SELECT u.id FROM "User" u WHERE u."tenantId" = d."tenantId" AND u.role = 'OWNER'::"UserRole" ORDER BY u."createdAt" ASC LIMIT 1),
          (SELECT u.id FROM "User" u WHERE u."tenantId" = d."tenantId" ORDER BY u."createdAt" ASC LIMIT 1)
        )
        WHERE d."ownerId" IS NULL;
      `);
    } else {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "Deal" d
        SET "ownerId" = (
          SELECT u.id FROM "User" u WHERE u."tenantId" = d."tenantId" ORDER BY u."createdAt" ASC LIMIT 1
        )
        WHERE d."ownerId" IS NULL;
      `);
    }

    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Deal_ownerId_idx" ON "Deal"("ownerId");`);

    const fkName = 'Deal_ownerId_fkey';
    const fkExists = await this.constraintExists(fkName);
    if (!fkExists) {
      try {
        await this.prisma.$executeRawUnsafe(`
          ALTER TABLE "Deal"
          ADD CONSTRAINT "${fkName}"
          FOREIGN KEY ("ownerId") REFERENCES "User"("id")
          ON DELETE SET NULL
          ON UPDATE CASCADE;
        `);
      } catch {
        // Ignore if the constraint already exists under a different name.
      }
    }
  }

  private async ensureDealProposalFields() {
    const hasProposalFilePath = await this.columnExists('Deal', 'proposalFilePath');
    if (!hasProposalFilePath) {
      try {
        await this.prisma.$executeRawUnsafe(`ALTER TABLE "Deal" ADD COLUMN "proposalFilePath" TEXT;`);
      } catch {
        // Ignore permissions / already-added races.
      }
    }
  }

  private async ensureProductsSchema() {
    const hasProduct = await this.tableExists('Product');
    if (!hasProduct) {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Product" (
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
      `);
    }

    const hasDealItem = await this.tableExists('DealItem');
    if (!hasDealItem) {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "DealItem" (
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
      `);
    }

    // Indexes and unique constraints (idempotent).
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Product_tenantId_idx" ON "Product"("tenantId");`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DealItem_tenantId_idx" ON "DealItem"("tenantId");`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DealItem_dealId_idx" ON "DealItem"("dealId");`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DealItem_productId_idx" ON "DealItem"("productId");`);
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "DealItem_dealId_productId_key" ON "DealItem"("dealId","productId");`,
    );

    const fks: Array<{ name: string; sql: string }> = [
      {
        name: 'Product_tenantId_fkey',
        sql: `ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
      },
      {
        name: 'DealItem_tenantId_fkey',
        sql: `ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
      },
      {
        name: 'DealItem_dealId_fkey',
        sql: `ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
      },
      {
        name: 'DealItem_productId_fkey',
        sql: `ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
      },
    ];

    for (const fk of fks) {
      const exists = await this.constraintExists(fk.name);
      if (exists) continue;
      try {
        await this.prisma.$executeRawUnsafe(fk.sql);
      } catch {
        // Ignore constraint races / existing under another name.
      }
    }
  }

  private async ensureClientProfileFields() {
    // New optional client profile fields added in 2026-02 (firstName/function/companySector).
    // Keep the API resilient even if Prisma Migrate hasn't been executed yet.
    const columns: Array<{ name: string; type: string }> = [
      { name: 'firstName', type: 'TEXT' },
      { name: 'function', type: 'TEXT' },
      { name: 'companySector', type: 'TEXT' },
    ];

    for (const col of columns) {
      const exists = await this.columnExists('Client', col.name);
      if (exists) continue;
      try {
        await this.prisma.$executeRawUnsafe(`ALTER TABLE "Client" ADD COLUMN "${col.name}" ${col.type};`);
      } catch {
        // Ignore permissions / already-added races.
      }
    }
  }

  private async ensureSubscriptionsSchema() {
    const hasSubscription = await this.tableExists('Subscription');
    if (!hasSubscription) {
      // Create enum if missing (no IF NOT EXISTS for CREATE TYPE in Postgres).
      await this.prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'SubscriptionStatus' AND n.nspname = 'public'
          ) THEN
            CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELED');
          END IF;
        END $$;
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Subscription" (
          "id" TEXT NOT NULL,
          "tenantId" TEXT NOT NULL,
          "customerTenantId" TEXT NOT NULL,
          "customerName" TEXT NOT NULL,
          "contactFirstName" TEXT,
          "contactLastName" TEXT,
          "contactEmail" TEXT,
          "plan" TEXT NOT NULL DEFAULT 'TRIAL',
          "seats" INTEGER NOT NULL DEFAULT 1,
          "trialEndsAt" TIMESTAMP(3),
          "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
        );
      `);
    }

    // New optional subscription contact fields.
    const columns: Array<{ name: string; type: string }> = [
      { name: 'contactFirstName', type: 'TEXT' },
      { name: 'contactLastName', type: 'TEXT' },
      { name: 'contactEmail', type: 'TEXT' },
      { name: 'plan', type: `TEXT NOT NULL DEFAULT 'TRIAL'` },
      { name: 'seats', type: `INTEGER NOT NULL DEFAULT 1` },
      { name: 'trialEndsAt', type: 'TIMESTAMP(3)' },
    ];
    for (const col of columns) {
      const exists = await this.columnExists('Subscription', col.name);
      if (exists) continue;
      try {
        await this.prisma.$executeRawUnsafe(`ALTER TABLE "Subscription" ADD COLUMN "${col.name}" ${col.type};`);
      } catch {
        // Ignore permissions / already-added races.
      }
    }

    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_customerTenantId_key" ON "Subscription"("customerTenantId");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Subscription_tenantId_idx" ON "Subscription"("tenantId");`,
    );

    const fkName = 'Subscription_tenantId_fkey';
    const fkExists = await this.constraintExists(fkName);
    if (!fkExists) {
      try {
        await this.prisma.$executeRawUnsafe(`
          ALTER TABLE "Subscription"
          ADD CONSTRAINT "${fkName}"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
          ON DELETE CASCADE
          ON UPDATE CASCADE;
        `);
      } catch {
        // Ignore if the constraint already exists under a different name.
      }
    }
  }

  private async ensureTenantBrandingFields() {
    const columns: Array<{ name: string; type: string }> = [
      { name: 'logoDataUrl', type: 'TEXT' },
      { name: 'accentColor', type: 'TEXT' },
      { name: 'accentColor2', type: 'TEXT' },
    ];

    for (const col of columns) {
      const exists = await this.columnExists('Tenant', col.name);
      if (exists) continue;
      try {
        await this.prisma.$executeRawUnsafe(`ALTER TABLE "Tenant" ADD COLUMN "${col.name}" ${col.type};`);
      } catch {
        // Ignore permissions / already-added races.
      }
    }
  }

  private async ensureTenantCrmSettingsFields() {
    const columns: Array<{ name: string; type: string }> = [
      { name: 'crmMode', type: `TEXT NOT NULL DEFAULT 'B2B'` },
      { name: 'industry', type: 'TEXT' },
    ];

    for (const col of columns) {
      const exists = await this.columnExists('Tenant', col.name);
      if (exists) continue;
      try {
        await this.prisma.$executeRawUnsafe(`ALTER TABLE "Tenant" ADD COLUMN "${col.name}" ${col.type};`);
      } catch {
        // Ignore permissions / already-added races.
      }
    }
  }
}
