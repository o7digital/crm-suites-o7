-- Post-Sales project workspace (Phase 1)
-- Non-destructive: adds new tables only.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ProjectStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'active', 'waiting_client', 'completed');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ProjectPriority' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "ProjectPriority" AS ENUM ('low', 'medium', 'high');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ProjectHealthStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "ProjectHealthStatus" AS ENUM ('healthy', 'risk', 'critical');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ProjectTaskStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "ProjectTaskStatus" AS ENUM ('todo', 'in_progress', 'waiting_client', 'done');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ProjectTaskPriority' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "ProjectTaskPriority" AS ENUM ('low', 'medium', 'high');
  END IF;
END $$;

CREATE TABLE "projects" (
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
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_sections" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,

  CONSTRAINT "project_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_tasks" (
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
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_comments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "author_user_id" TEXT,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "projects_tenant_id_idx" ON "projects"("tenant_id");
CREATE INDEX "projects_client_id_idx" ON "projects"("client_id");
CREATE INDEX "projects_deal_id_idx" ON "projects"("deal_id");
CREATE INDEX "projects_owner_user_id_idx" ON "projects"("owner_user_id");

CREATE INDEX "project_sections_tenant_id_idx" ON "project_sections"("tenant_id");
CREATE INDEX "project_sections_project_id_idx" ON "project_sections"("project_id");
CREATE UNIQUE INDEX "project_sections_project_id_position_key" ON "project_sections"("project_id", "position");

CREATE INDEX "project_tasks_tenant_id_idx" ON "project_tasks"("tenant_id");
CREATE INDEX "project_tasks_project_id_idx" ON "project_tasks"("project_id");
CREATE INDEX "project_tasks_section_id_idx" ON "project_tasks"("section_id");
CREATE INDEX "project_tasks_client_id_idx" ON "project_tasks"("client_id");
CREATE INDEX "project_tasks_assignee_user_id_idx" ON "project_tasks"("assignee_user_id");
CREATE INDEX "project_tasks_parent_task_id_idx" ON "project_tasks"("parent_task_id");
CREATE INDEX "project_tasks_project_id_section_id_position_idx" ON "project_tasks"("project_id", "section_id", "position");

CREATE INDEX "task_comments_tenant_id_idx" ON "task_comments"("tenant_id");
CREATE INDEX "task_comments_task_id_idx" ON "task_comments"("task_id");
CREATE INDEX "task_comments_author_user_id_idx" ON "task_comments"("author_user_id");

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_deal_id_fkey"
  FOREIGN KEY ("deal_id") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_sections"
  ADD CONSTRAINT "project_sections_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_sections"
  ADD CONSTRAINT "project_sections_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_tasks"
  ADD CONSTRAINT "project_tasks_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_tasks"
  ADD CONSTRAINT "project_tasks_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_tasks"
  ADD CONSTRAINT "project_tasks_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "project_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_tasks"
  ADD CONSTRAINT "project_tasks_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_tasks"
  ADD CONSTRAINT "project_tasks_assignee_user_id_fkey"
  FOREIGN KEY ("assignee_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_tasks"
  ADD CONSTRAINT "project_tasks_parent_task_id_fkey"
  FOREIGN KEY ("parent_task_id") REFERENCES "project_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_comments"
  ADD CONSTRAINT "task_comments_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_comments"
  ADD CONSTRAINT "task_comments_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "project_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_comments"
  ADD CONSTRAINT "task_comments_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_comments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_tenant_isolation" ON "projects"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL);

CREATE POLICY "project_sections_tenant_isolation" ON "project_sections"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL);

CREATE POLICY "project_tasks_tenant_isolation" ON "project_tasks"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL);

CREATE POLICY "task_comments_tenant_isolation" ON "task_comments"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) IS NULL);
