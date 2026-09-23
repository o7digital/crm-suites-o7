INSERT INTO "Tenant" ("id", "name", "updatedAt") VALUES ('phase1-legacy-tenant', 'Legacy fixture', '2020-01-01');
INSERT INTO "Client" ("id", "name", "tenantId", "updatedAt") VALUES ('phase1-legacy-client', 'Legacy contact', 'phase1-legacy-tenant', '2020-01-01');
INSERT INTO "Task" ("id", "title", "tenantId", "clientId", "status", "createdAt", "updatedAt") VALUES ('phase1-legacy-task', 'Legacy completed task', 'phase1-legacy-tenant', 'phase1-legacy-client', 'DONE', '2020-01-01', '2020-01-02');
