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
    await this.ensureDealProbability();
    await this.ensureDealProposalFields();
    await this.ensureTaskTimeTrackingFields();
    await this.ensureProductsSchema();
    await this.ensureClientProfileFields();
    await this.ensureClientCollaboratorsSchema();
    await this.ensureSubscriptionsSchema();
    await this.ensureTenantBrandingFields();
    await this.ensureTenantCrmSettingsFields();
    await this.ensurePostSalesProjectsSchema();
    await this.ensureGoogleCalendarConnectionSchema();
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
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "Deal" ADD COLUMN "clientId" TEXT;`,
      );
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
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "Deal" ADD COLUMN "ownerId" TEXT;`,
      );
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

    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Deal_ownerId_idx" ON "Deal"("ownerId");`,
    );

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
    const hasProposalFilePath = await this.columnExists(
      'Deal',
      'proposalFilePath',
    );
    if (!hasProposalFilePath) {
      try {
        await this.prisma.$executeRawUnsafe(
          `ALTER TABLE "Deal" ADD COLUMN "proposalFilePath" TEXT;`,
        );
      } catch {
        // Ignore permissions / already-added races.
      }
    }
  }

  private async ensureDealProbability() {
    const hasProbability = await this.columnExists('Deal', 'probability');
    if (hasProbability) return;

    try {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "Deal" ADD COLUMN "probability" DOUBLE PRECISION;`,
      );
    } catch {
      // Ignore permissions / already-added races.
    }
  }

  private async ensureTaskTimeTrackingFields() {
    const hasTimeSpentHours = await this.columnExists('Task', 'timeSpentHours');
    if (hasTimeSpentHours) return;
    try {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "Task" ADD COLUMN "timeSpentHours" DECIMAL(8,2);`,
      );
    } catch {
      // Ignore permissions / already-added races.
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
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Product_tenantId_idx" ON "Product"("tenantId");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "DealItem_tenantId_idx" ON "DealItem"("tenantId");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "DealItem_dealId_idx" ON "DealItem"("dealId");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "DealItem_productId_idx" ON "DealItem"("productId");`,
    );
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
    // Client profile fields added incrementally in 2026-02 and 2026-03.
    // Keep the API resilient even if Prisma Migrate hasn't been executed yet.
    const columns: Array<{ name: string; type: string }> = [
      { name: 'firstName', type: 'TEXT' },
      { name: 'function', type: 'TEXT' },
      { name: 'companySector', type: 'TEXT' },
      { name: 'clientStatus', type: `TEXT NOT NULL DEFAULT 'CLIENT'` },
      { name: 'dateOfBirth', type: 'TEXT' },
    ];

    for (const col of columns) {
      const exists = await this.columnExists('Client', col.name);
      if (exists) continue;
      try {
        await this.prisma.$executeRawUnsafe(
          `ALTER TABLE "Client" ADD COLUMN "${col.name}" ${col.type};`,
        );
      } catch {
        // Ignore permissions / already-added races.
      }
    }
  }

  private async ensureClientCollaboratorsSchema() {
    const hasTable = await this.tableExists('ClientCollaborator');
    if (!hasTable) {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ClientCollaborator" (
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
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ClientCollaborator_pkey" PRIMARY KEY ("id")
        );
      `);
    }

    const columns: Array<{ name: string; type: string }> = [
      { name: 'tenantId', type: 'TEXT' },
      { name: 'clientId', type: 'TEXT' },
      { name: 'firstName', type: 'TEXT' },
      { name: 'name', type: `TEXT NOT NULL DEFAULT ''` },
      { name: 'function', type: 'TEXT' },
      { name: 'email', type: 'TEXT' },
      { name: 'whatsapp', type: 'TEXT' },
      { name: 'comments', type: 'TEXT' },
      {
        name: 'createdAt',
        type: 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
      },
      {
        name: 'updatedAt',
        type: 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
      },
    ];

    for (const col of columns) {
      const exists = await this.columnExists('ClientCollaborator', col.name);
      if (exists) continue;
      try {
        await this.prisma.$executeRawUnsafe(
          `ALTER TABLE "ClientCollaborator" ADD COLUMN "${col.name}" ${col.type};`,
        );
      } catch {
        // Ignore permissions / already-added races.
      }
    }

    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "ClientCollaborator_tenantId_idx" ON "ClientCollaborator"("tenantId");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "ClientCollaborator_clientId_idx" ON "ClientCollaborator"("clientId");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "ClientCollaborator_tenantId_clientId_idx" ON "ClientCollaborator"("tenantId","clientId");`,
    );

    const fks: Array<{ name: string; sql: string }> = [
      {
        name: 'ClientCollaborator_tenantId_fkey',
        sql: `ALTER TABLE "ClientCollaborator" ADD CONSTRAINT "ClientCollaborator_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
      },
      {
        name: 'ClientCollaborator_clientId_fkey',
        sql: `ALTER TABLE "ClientCollaborator" ADD CONSTRAINT "ClientCollaborator_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
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
        await this.prisma.$executeRawUnsafe(
          `ALTER TABLE "Subscription" ADD COLUMN "${col.name}" ${col.type};`,
        );
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
      { name: 'backgroundColor', type: 'TEXT' },
      { name: 'surfaceColor', type: 'TEXT' },
      { name: 'cardColor', type: 'TEXT' },
      { name: 'foregroundColor', type: 'TEXT' },
      { name: 'mutedColor', type: 'TEXT' },
      { name: 'accentColor', type: 'TEXT' },
      { name: 'accentColor2', type: 'TEXT' },
    ];

    for (const col of columns) {
      const exists = await this.columnExists('Tenant', col.name);
      if (exists) continue;
      try {
        await this.prisma.$executeRawUnsafe(
          `ALTER TABLE "Tenant" ADD COLUMN "${col.name}" ${col.type};`,
        );
      } catch {
        // Ignore permissions / already-added races.
      }
    }
  }

  private async ensureTenantCrmSettingsFields() {
    const columns: Array<{ name: string; type: string }> = [
      { name: 'crmMode', type: `TEXT NOT NULL DEFAULT 'B2B'` },
      { name: 'crmDisplayCurrency', type: `TEXT NOT NULL DEFAULT 'USD'` },
      { name: 'industry', type: 'TEXT' },
      { name: 'contractSetup', type: 'JSONB' },
      { name: 'marketingSetup', type: 'JSONB' },
    ];

    for (const col of columns) {
      const exists = await this.columnExists('Tenant', col.name);
      if (exists) continue;
      try {
        await this.prisma.$executeRawUnsafe(
          `ALTER TABLE "Tenant" ADD COLUMN "${col.name}" ${col.type};`,
        );
      } catch {
        // Ignore permissions / already-added races.
      }
    }
  }

  private async ensureGoogleCalendarConnectionSchema() {
    const hasConnection = await this.tableExists('GoogleCalendarConnection');
    if (!hasConnection) {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "GoogleCalendarConnection" (
          "id" TEXT NOT NULL,
          "tenantId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "googleEmail" TEXT NOT NULL,
          "refreshTokenCipher" TEXT NOT NULL,
          "calendarId" TEXT NOT NULL DEFAULT 'primary',
          "calendarSummary" TEXT,
          "lastSyncAt" TIMESTAMP(3),
          "lastSyncError" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("id")
        );
      `);
    }

    const columns: Array<{ name: string; type: string }> = [
      { name: 'googleEmail', type: "TEXT NOT NULL DEFAULT ''" },
      { name: 'refreshTokenCipher', type: "TEXT NOT NULL DEFAULT ''" },
      { name: 'calendarId', type: `TEXT NOT NULL DEFAULT 'primary'` },
      { name: 'calendarSummary', type: 'TEXT' },
      { name: 'lastSyncAt', type: 'TIMESTAMP(3)' },
      { name: 'lastSyncError', type: 'TEXT' },
    ];

    for (const col of columns) {
      const exists = await this.columnExists(
        'GoogleCalendarConnection',
        col.name,
      );
      if (exists) continue;
      try {
        await this.prisma.$executeRawUnsafe(
          `ALTER TABLE "GoogleCalendarConnection" ADD COLUMN "${col.name}" ${col.type};`,
        );
      } catch {
        // Ignore permissions / already-added races.
      }
    }

    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "GoogleCalendarConnection_userId_key" ON "GoogleCalendarConnection"("userId");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "GoogleCalendarConnection_tenantId_idx" ON "GoogleCalendarConnection"("tenantId");`,
    );

    const fks: Array<{ name: string; sql: string }> = [
      {
        name: 'GoogleCalendarConnection_tenantId_fkey',
        sql: `ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
      },
      {
        name: 'GoogleCalendarConnection_userId_fkey',
        sql: `ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
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

  private async ensurePostSalesProjectsSchema() {
    // Enums
    await this.prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'ProjectStatus' AND n.nspname = 'public'
        ) THEN
          CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'active', 'waiting_client', 'completed');
        END IF;
      END $$;
    `);
    await this.prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'ProjectPriority' AND n.nspname = 'public'
        ) THEN
          CREATE TYPE "ProjectPriority" AS ENUM ('low', 'medium', 'high');
        END IF;
      END $$;
    `);
    await this.prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'ProjectHealthStatus' AND n.nspname = 'public'
        ) THEN
          CREATE TYPE "ProjectHealthStatus" AS ENUM ('healthy', 'risk', 'critical');
        END IF;
      END $$;
    `);
    await this.prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'ProjectTaskStatus' AND n.nspname = 'public'
        ) THEN
          CREATE TYPE "ProjectTaskStatus" AS ENUM ('todo', 'in_progress', 'waiting_client', 'done');
        END IF;
      END $$;
    `);
    await this.prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'ProjectTaskPriority' AND n.nspname = 'public'
        ) THEN
          CREATE TYPE "ProjectTaskPriority" AS ENUM ('low', 'medium', 'high');
        END IF;
      END $$;
    `);

    // Base tables
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "projects" (
        "id" TEXT NOT NULL,
        "tenant_id" TEXT NOT NULL,
        "client_id" TEXT NOT NULL,
        "deal_id" TEXT,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
        "priority" "ProjectPriority" NOT NULL DEFAULT 'medium',
        "health_status" "ProjectHealthStatus" NOT NULL DEFAULT 'healthy',
        "owner_user_id" TEXT,
        "start_date" TIMESTAMP(3),
        "due_date" TIMESTAMP(3),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
      );
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "project_sections" (
        "id" TEXT NOT NULL,
        "tenant_id" TEXT NOT NULL,
        "project_id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "position" INTEGER NOT NULL,
        CONSTRAINT "project_sections_pkey" PRIMARY KEY ("id")
      );
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "project_tasks" (
        "id" TEXT NOT NULL,
        "tenant_id" TEXT NOT NULL,
        "project_id" TEXT NOT NULL,
        "section_id" TEXT,
        "client_id" TEXT,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "status" "ProjectTaskStatus" NOT NULL DEFAULT 'todo',
        "priority" "ProjectTaskPriority" NOT NULL DEFAULT 'medium',
        "assignee_user_id" TEXT,
        "start_date" TIMESTAMP(3),
        "due_date" TIMESTAMP(3),
        "estimated_hours" DECIMAL(8,2),
        "spent_hours" DECIMAL(8,2),
        "parent_task_id" TEXT,
        "position" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id")
      );
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "task_comments" (
        "id" TEXT NOT NULL,
        "tenant_id" TEXT NOT NULL,
        "task_id" TEXT NOT NULL,
        "author_user_id" TEXT,
        "body" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
      );
    `);

    // Indexes
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "projects_tenant_id_idx" ON "projects"("tenant_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "projects_client_id_idx" ON "projects"("client_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "projects_deal_id_idx" ON "projects"("deal_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "projects_owner_user_id_idx" ON "projects"("owner_user_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "project_sections_tenant_id_idx" ON "project_sections"("tenant_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "project_sections_project_id_idx" ON "project_sections"("project_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "project_sections_project_id_position_key" ON "project_sections"("project_id","position");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "project_tasks_tenant_id_idx" ON "project_tasks"("tenant_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "project_tasks_project_id_idx" ON "project_tasks"("project_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "project_tasks_section_id_idx" ON "project_tasks"("section_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "project_tasks_client_id_idx" ON "project_tasks"("client_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "project_tasks_assignee_user_id_idx" ON "project_tasks"("assignee_user_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "project_tasks_parent_task_id_idx" ON "project_tasks"("parent_task_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "project_tasks_project_id_section_id_position_idx" ON "project_tasks"("project_id","section_id","position");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "task_comments_tenant_id_idx" ON "task_comments"("tenant_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "task_comments_task_id_idx" ON "task_comments"("task_id");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "task_comments_author_user_id_idx" ON "task_comments"("author_user_id");`,
    );

    // Foreign keys
    const fks: Array<{ name: string; sql: string }> = [
      {
        name: 'projects_tenant_id_fkey',
        sql: `ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
      },
      {
        name: 'projects_client_id_fkey',
        sql: `ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
      },
      {
        name: 'projects_deal_id_fkey',
        sql: `ALTER TABLE "projects" ADD CONSTRAINT "projects_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
      },
      {
        name: 'projects_owner_user_id_fkey',
        sql: `ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
      },
      {
        name: 'project_sections_tenant_id_fkey',
        sql: `ALTER TABLE "project_sections" ADD CONSTRAINT "project_sections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
      },
      {
        name: 'project_sections_project_id_fkey',
        sql: `ALTER TABLE "project_sections" ADD CONSTRAINT "project_sections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
      },
      {
        name: 'project_tasks_tenant_id_fkey',
        sql: `ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
      },
      {
        name: 'project_tasks_project_id_fkey',
        sql: `ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
      },
      {
        name: 'project_tasks_section_id_fkey',
        sql: `ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "project_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
      },
      {
        name: 'project_tasks_client_id_fkey',
        sql: `ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
      },
      {
        name: 'project_tasks_assignee_user_id_fkey',
        sql: `ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
      },
      {
        name: 'project_tasks_parent_task_id_fkey',
        sql: `ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "project_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
      },
      {
        name: 'task_comments_tenant_id_fkey',
        sql: `ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
      },
      {
        name: 'task_comments_task_id_fkey',
        sql: `ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "project_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
      },
      {
        name: 'task_comments_author_user_id_fkey',
        sql: `ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
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

    // RLS + policies
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "project_sections" ENABLE ROW LEVEL SECURITY;`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "project_tasks" ENABLE ROW LEVEL SECURITY;`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "task_comments" ENABLE ROW LEVEL SECURITY;`,
    );

    const policies: Array<{ name: string; table: string }> = [
      { name: 'projects_tenant_isolation', table: 'projects' },
      {
        name: 'project_sections_tenant_isolation',
        table: 'project_sections',
      },
      { name: 'project_tasks_tenant_isolation', table: 'project_tasks' },
      { name: 'task_comments_tenant_isolation', table: 'task_comments' },
    ];

    for (const policy of policies) {
      try {
        await this.prisma.$executeRawUnsafe(`
          CREATE POLICY "${policy.name}" ON "${policy.table}"
            USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL)
            WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL);
        `);
      } catch {
        // Ignore if policy already exists.
      }
    }
  }
}
