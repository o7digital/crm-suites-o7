// Explicit maintenance command; never invoked during API startup.
const { PrismaClient } = require('@prisma/client');
const { transformMarketingSecrets } = require('../dist/tenant/marketing-secrets');
const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const fields = [['smtp', 'password'], ['mailchimp', 'apiKey'], ['brevo', 'apiKey'], ['buffer', 'apiKey']];
async function main() {
  let cursor; let candidates = 0; let encrypted = 0; let conflicts = 0;
  do {
    const rows = await prisma.tenant.findMany({ select: { id: true, marketingSetup: true, updatedAt: true }, orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!rows.length) break;
    for (const row of rows) {
      const needsEncryption = fields.some(([provider, field]) => {
        const value = row.marketingSetup?.[provider]?.[field];
        return typeof value === 'string' && value && !value.startsWith('enc:v1:');
      });
      if (!needsEncryption) continue;
      candidates++;
      if (apply) {
        const marketingSetup = transformMarketingSecrets(transformMarketingSecrets(row.marketingSetup, false), true);
        const result = await prisma.tenant.updateMany({ where: { id: row.id, updatedAt: row.updatedAt }, data: { marketingSetup } });
        if (result.count) encrypted++; else conflicts++;
      }
    }
    cursor = rows.at(-1).id;
  } while (cursor);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', candidates, encrypted, conflicts }));
  if (conflicts) process.exitCode = 2;
}
main().catch(() => { console.error('Encryption failed; verify server key and database access. No credentials were logged.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
