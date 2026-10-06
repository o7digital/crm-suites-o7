import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/workspace-sellers.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { isWorkspaceSeller } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('excludes tenant support accounts for every operator and tenant', () => {
  for (const email of [
    'olivier.steineur+support-7c6ee9bd-d81@gmail.com',
    'another.operator+support-different-id@example.com',
    ' OLIVIER.STEINEUR+SUPPORT-7C6EE9BD-D81@GMAIL.COM ',
  ]) assert.equal(isWorkspaceSeller({ email }), false);
});

test('retains actual owners, admins and sellers including the operator in their own workspace', () => {
  for (const email of ['octaviomc67@gmail.com', 'jorge.velazquezeonova@gmail.com', 'olivier.steineur@gmail.com', 'support@example.com', 'seller+sales@example.com']) {
    assert.equal(isWorkspaceSeller({ email }), true);
  }
});

test('stale stored support quotas cannot contribute to the visible seller totals', () => {
  const users = [{ id: 'support', email: 'operator+support-tenant@example.com' }, { id: 'seller', email: 'seller@example.com' }];
  const savedTargets = { support: 100000, seller: 500 };
  const sellers = users.filter(isWorkspaceSeller);
  assert.deepEqual(sellers.map(user => user.id), ['seller']);
  assert.equal(sellers.reduce((sum, user) => sum + savedTargets[user.id], 0), 500);
});
