import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync } from 'node:fs';

const prisma = new PrismaClient();
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
try {
  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_name, bool_or(column_name = 'tenantId') AS tenant_scoped
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
    GROUP BY table_name ORDER BY table_name
  `);
  const manifest = {};
  for (const { table_name: name, tenant_scoped: tenantScoped } of tables) {
    const [total] = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count,
        md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)->>'id', to_jsonb(r)::text)::text, '[]')) AS digest
      FROM ${quote(name)} r
    `);
    const tenants = tenantScoped ? await prisma.$queryRawUnsafe(`
      SELECT "tenantId", count(*)::int AS count,
        md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)->>'id', to_jsonb(r)::text)::text, '[]')) AS digest
      FROM ${quote(name)} r GROUP BY "tenantId" ORDER BY "tenantId"
    `) : [];
    manifest[name] = { ...total, tenants };
  }
  const args = process.argv.slice(2);
  const expectedFile = args[args.indexOf('--compare') + 1];
  if (args.includes('--compare')) {
    const expected = JSON.parse(readFileSync(expectedFile, 'utf8'));
    const differences = [...new Set([...Object.keys(expected), ...Object.keys(manifest)])]
      .filter((name) => JSON.stringify(expected[name]) !== JSON.stringify(manifest[name]));
    if (differences.length) throw new Error(`Migration differs in tables: ${differences.join(', ')}`);
    console.log('Verified: every table and every tenant matches the source snapshot.');
  }
  if (args.includes('--out')) {
    const destination = args[args.indexOf('--out') + 1];
    writeFileSync(destination, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  }
  console.log(JSON.stringify({ tables: tables.length, tenants: manifest.Tenant?.count, subscriptions: manifest.Subscription?.count, users: manifest.User?.count, clients: manifest.Client?.count, deals: manifest.Deal?.count, tasks: manifest.Task?.count }));
} finally {
  await prisma.$disconnect();
}
