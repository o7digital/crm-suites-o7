import { expect, test } from '@playwright/test';
import type { ExtraField } from '../src/components/ProductFieldsEditor';

test('creates, edits, reloads and reuses typed product fields while preserving legacy fields', async ({ page }) => {
  const user = {
    id: 'test-admin',
    tenantId: 'test-workspace',
    name: 'Test',
    email: 'test@example.test',
    role: 'OWNER',
  };
  let products = [
    {
      id: 'legacy',
      name: 'Legacy product',
      productType: 'Product',
      periodicity: 'One-time',
      currency: 'USD',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      extraFields: [{ label: 'Note', value: 'Legacy text' }] as ExtraField[],
    },
  ];
  let mutations = 0;
  await page.addInitScript((user) => {
    localStorage.setItem('localAuthSession', 'true');
    localStorage.setItem('token', 'test');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('o7_language', 'en');
  }, user);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    let data: unknown = {};
    if (path === '/auth/me') data = { user: { userId: user.id, tenantId: user.tenantId } };
    else if (path === '/products') {
      if (route.request().method() === 'POST') {
        mutations++;
        const product = { ...route.request().postDataJSON(), id: `p${mutations}`, createdAt: new Date().toISOString() };
        products = [product, ...products];
        data = product;
      } else data = products;
    } else if (path.startsWith('/products/')) {
      mutations++;
      const id = path.split('/').pop();
      products = products.map((product) =>
        product.id === id ? { ...product, ...route.request().postDataJSON() } : product,
      );
      data = products.find((product) => product.id === id);
    } else if (path === '/admin/context') data = { role: 'OWNER', canManageSubscriptions: false };
    else if (path === '/tenant/settings') data = { settings: { crmMode: 'B2B' } };
    else if (path === '/tenant/branding') data = { branding: {} };
    else data = [];
    await route.fulfill({ json: data });
  });

  await page.goto('/admin/parameters/products');
  await expect(page.getByText('Legacy text', { exact: true })).toBeVisible();
  await page.getByLabel('Product type', { exact: true }).selectOption('Subscription');
  await page.getByLabel('Product periodicity', { exact: true }).selectOption('Monthly');
  await expect(page.getByRole('button', { name: 'Remove field 1', exact: true })).toHaveCount(0);
  await page.getByText('Name', { exact: true }).locator('input').fill('O7 Pulse Basic test');
  await page.getByLabel('Add common fields', { exact: true }).selectOption('o7');
  await page.getByLabel('Field value 1', { exact: true }).selectOption('O7 Pulse');
  await page.getByLabel('Field value 2', { exact: true }).selectOption('Basic');
  for (const field of [
    { index: 3, label: 'Seats', type: 'number', value: '12.5' },
    { index: 4, label: 'Renewal', type: 'date', value: '2026-12-31' },
    { index: 5, label: 'Enabled', type: 'boolean', value: 'false' },
  ]) {
    await page.getByRole('button', { name: '+ Add a field', exact: true }).click();
    await page.getByLabel(`Field name ${field.index}`, { exact: true }).fill(field.label);
    await page.getByLabel(`Field type ${field.index}`, { exact: true }).selectOption(field.type);
    const input = page.getByLabel(`Field value ${field.index}`, { exact: true });
    if (field.type === 'boolean') await input.selectOption(field.value);
    else await input.fill(field.value);
  }
  await page.getByRole('button', { name: 'Create product', exact: true }).click();
  const card = page
    .locator('.card')
    .filter({ has: page.locator('p.font-semibold').filter({ hasText: /^O7 Pulse Basic test$/ }) });
  await expect(card.getByText('No', { exact: true })).toBeVisible();
  expect(products[0].productType).toBe('Subscription');
  expect(products[0].periodicity).toBe('Monthly');
  expect(products[0].extraFields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'number', value: '12.5' }),
      expect.objectContaining({ type: 'date', value: '2026-12-31' }),
      expect.objectContaining({ type: 'select', options: ['O7 Pulse', 'Olivia'], value: 'O7 Pulse' }),
    ]),
  );
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Product type', { exact: true }).selectOption('Rental');
  await page.getByRole('dialog').getByLabel('Product periodicity', { exact: true }).selectOption('Yearly');
  await page.getByLabel('Field choices 2', { exact: true }).fill('Basic\nAdvanced\nPremium\nCustom plan');
  await page.getByLabel('Field value 2', { exact: true }).selectOption('Custom plan');
  await page.getByLabel('Field value 3', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(card.getByText('Custom plan', { exact: true })).toBeVisible();
  expect(products[0].productType).toBe('Rental');
  expect(products[0].periodicity).toBe('Yearly');
  await page.reload();
  await expect(card.getByText('Custom plan', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Field choices 2', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Add at least one choice for "Edition".', { exact: true })).toBeAttached();
  expect(mutations).toBe(2);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.getByLabel('Reuse fields from a product', { exact: true }).selectOption('p1');
  await expect(page.getByLabel('Field type 3', { exact: true })).toHaveValue('number');
  await expect(page.getByLabel('Field value 2', { exact: true })).toHaveValue('');
  await page.getByText('Name', { exact: true }).locator('input').fill('Another edition');
  await page.getByRole('button', { name: 'Create product', exact: true }).click();
  await expect(page.locator('p.font-semibold').filter({ hasText: /^Another edition$/ })).toBeVisible();
  expect(products[0].extraFields.every((field) => field.value === '')).toBe(true);
  expect(products[0].extraFields[1].options).toContain('Custom plan');

  const legacy = page
    .locator('.card')
    .filter({ has: page.locator('p.font-semibold').filter({ hasText: /^Legacy product$/ }) });
  await legacy.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Field type 1', { exact: true })).toHaveValue('text');
  await expect(page.getByLabel('Field value 1', { exact: true })).toHaveValue('Legacy text');
  await page.getByRole('button', { name: 'Remove field 1', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(legacy.getByText('Legacy text', { exact: true })).toHaveCount(0);
});
