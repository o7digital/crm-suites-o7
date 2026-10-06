import { expect, test } from '@playwright/test';

const user = { id: 'report-owner', tenantId: 'kabin', email: 'owner@example.test', name: 'Owner', role: 'OWNER', tenantName: 'KABIN CONSULTORES' };

test('customizes charts, preserves account preferences, separates currencies and prints on mobile', async ({ page }) => {
  await page.addInitScript(user => {
    localStorage.setItem('localAuthSession', 'true');
    localStorage.setItem('token', 'test-token');
    if (!localStorage.getItem('user')) localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('o7_language', 'en');
  }, user);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    const date = new Date().toISOString().slice(0, 10);
    const deal = { id: 'usd', title: 'USD sale', clientId: 'a', client: { name: 'Client A' }, status: 'WON', closedAt: date, value: 100, currency: 'USD' };
    const data = path === '/auth/me' ? { user: await page.evaluate(() => { const u = JSON.parse(localStorage.getItem('user')!); return { userId: u.id, tenantId: u.tenantId }; }) }
      : path === '/deals' ? [deal, { ...deal, id: 'mxn', title: 'MXN sale', value: 900, currency: 'MXN' }, { ...deal, id: 'lost', status: 'LOST', lossReason: 'Price', value: 500 }]
      : path === '/tasks' ? [{ id: 'task', title: 'Delivery', clientId: 'a', status: 'DONE', dueDate: date, timeSpentHours: 2.5 }]
      : path === '/clients' ? [{ id: 'a', name: 'Client A' }]
      : path === '/tenant/settings' ? { settings: { crmMode: 'B2B', crmDisplayCurrency: 'USD' } }
      : path === '/tenant/branding' ? { branding: {} } : {};
    await route.fulfill({ json: data });
  });
  await page.goto('/admin/reporting');
  const charts = page.getByRole('region', { name: 'Your reporting charts' });
  await expect(charts.locator('article')).toHaveCount(3);
  await page.getByLabel('Currency 2', { exact: true }).selectOption('USD');
  const revenue = charts.locator('article').nth(1);
  await expect(revenue.getByText('100 USD Total', { exact: true })).toBeVisible();
  await page.getByLabel('Chart type 1', { exact: true }).selectOption('bar');
  await page.getByLabel('Breakdown 1', { exact: true }).selectOption('reason');
  await expect(charts.locator('article').first().getByText('Price', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Add chart', exact: true }).click();
  await expect(charts.locator('article')).toHaveCount(4);
  await page.reload();
  await expect(charts.locator('article')).toHaveCount(4);
  await expect(page.getByLabel('Chart type 1', { exact: true })).toHaveValue('bar');
  await expect(page.getByLabel('Breakdown 1', { exact: true })).toHaveValue('reason');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(charts.locator('article').first()).toBeVisible();
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport + 1);
  await page.emulateMedia({ media: 'print' });
  await expect(charts.locator('article').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add chart', exact: true })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => localStorage.setItem('o7-reporting-charts-v1:kabin:report-owner', JSON.stringify([{ id: 'empty', metric: 'revenue', group: 'client', kind: 'pie', currency: 'EUR' }])));
  await page.reload();
  // Keep the selected currency even when there are no sales in that currency.
  await expect(charts.locator('article')).toHaveCount(1);
  await expect(page.getByLabel('Currency 1', { exact: true })).toHaveValue('EUR');
  await expect(charts.getByText('No data for this chart in the selected period.', { exact: true })).toBeVisible();
  await page.evaluate(() => { const user = JSON.parse(localStorage.getItem('user')!); user.id = 'another-owner'; localStorage.setItem('user', JSON.stringify(user)); });
  await page.reload();
  await expect(charts.locator('article')).toHaveCount(3);
});
