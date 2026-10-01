import { expect, test, Page } from '@playwright/test';

const user = { id: 'local-user', tenantId: 'workspace', name: 'Local client', email: 'client@example.test', tenantName: 'Client workspace', role: 'OWNER', createdAt: '2026-01-01T00:00:00Z' };

async function mockApi(page: Page, loginStatus = 200, identityStatus = 200) {
  await page.addInitScript(() => localStorage.setItem('o7_language', 'en'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    let status = 200;
    let data: unknown = {};
    if (path === '/auth/login') { status = loginStatus; data = status === 200 ? { token: 'local-jwt', user } : { message: 'Invalid credentials' }; }
    else if (path === '/auth/me') { status = identityStatus; data = { user: { userId: user.id, tenantId: user.tenantId } }; }
    else if (path === '/admin/users') data = [user];
    else if (path === '/admin/user-invites') data = [];
    else if (path === '/admin/context') data = { role: 'OWNER', canManageSubscriptions: false };
    else if (path.endsWith('/password')) data = { success: true };
    else if (path === '/tenant/settings') data = { settings: { crmMode: 'B2B', crmDisplayCurrency: 'USD' } };
    else if (path === '/tenant/branding') data = { branding: {} };
    else if (path === '/dashboard') data = { clients: 0, prospects: 0, tasks: {}, leads: { open: 0, total: 0, openByCurrency: [], fx: { missingCurrencies: [] } }, invoices: { total: 0, amount: 0, recent: [] } };
    else if (path === '/dashboard/command-center') data = Object.fromEntries(['dueToday', 'overdue', 'upcomingFollowUps', 'closingThisWeek', 'noNextAction', 'staleDeals'].map(k => [k, { count: 0, items: [] }]));
    else if (['/pipelines', '/stages', '/deals', '/clients', '/products', '/tasks/assignees'].includes(path)) data = [];
    await route.fulfill({ status, json: data });
  });
}

async function seedLocalSession(page: Page) {
  await page.addInitScript(user => {
    localStorage.setItem('localAuthSession', 'true');
    localStorage.setItem('token', 'local-jwt');
    localStorage.setItem('user', JSON.stringify(user));
  }, user);
}

test('signs in with a CRM password and restores the local session after reload', async ({ page }) => {
  await mockApi(page);
  let providerCalls = 0;
  await page.route('**/auth/v1/token**', route => { providerCalls++; return route.fulfill({ status: 400, json: {} }); });
  await page.goto('/login');
  await page.locator('input[type=email]').fill(user.email);
  await page.locator('input[type=password]').fill('AssignedPassword123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('localAuthSession'))).toBe('true');
  await page.goto('/admin/users');
  await expect(page.getByRole('button', { name: 'Set password', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Set password', exact: true })).toBeVisible();
  expect(providerCalls).toBe(0);
});

test('rejects an incorrect assigned password without attempting Supabase login', async ({ page }) => {
  await mockApi(page, 403);
  let providerCalls = 0;
  await page.route('**/auth/v1/token**', route => { providerCalls++; return route.fulfill({ status: 400, json: {} }); });
  await page.goto('/login');
  await page.locator('input[type=email]').fill(user.email);
  await page.locator('input[type=password]').fill('WrongPassword123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Invalid credentials', { exact: true })).toBeVisible();
  expect(providerCalls).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('localAuthSession'))).toBeNull();
});

test('sets an admin password only after matching confirmation', async ({ page }) => {
  await mockApi(page);
  await seedLocalSession(page);
  let saved: unknown;
  await page.route('**/api/admin/users/local-user/password', route => {
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { success: true } });
  });
  await page.goto('/admin/users');
  await page.getByLabel(`New password (${user.email})`).fill('AssignedPassword123');
  await page.getByLabel(`Confirm password (${user.email})`).fill('MismatchPassword123');
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Passwords do not match.');
  expect(saved).toBeUndefined();
  await page.getByLabel(`Confirm password (${user.email})`).fill('AssignedPassword123');
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Password saved.');
  expect(saved).toEqual({ password: 'AssignedPassword123' });
  await expect(page.getByLabel(`New password (${user.email})`)).toHaveValue('');
});

test('clears an expired local session and returns to login', async ({ page }) => {
  await mockApi(page, 200, 401);
  await seedLocalSession(page);
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('localAuthSession'))).toBeNull();
});
