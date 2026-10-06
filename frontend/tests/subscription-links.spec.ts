import { test, expect, type Page } from '@playwright/test';

const actor = { id: 'owner', tenantId: 'provider', email: 'owner@example.test', name: 'Owner', role: 'OWNER' };
const sub = { id: 'sub', customerName: 'RHEO', customerTenantId: 'rheo-tenant', customerCountry: 'MX', contactEmail: 'contact@example.test', plan: 'TRIAL', seats: 2, status: 'ACTIVE', activatedUsersCount: 1, pendingInvitesCount: 0, canSuspend: true, createdAt: '2026-10-01', updatedAt: '2026-10-01' };
const invite = { id: 'invite', email: sub.contactEmail.toUpperCase(), role: 'ADMIN', token: 'existing-token', status: 'PENDING', createdAt: '2026-10-01' };

async function setup(page: Page, mode: 'member' | 'pending' | 'new' | 'race' | 'blocked') {
  let posts = 0;
  let userReads = 0;
  await page.addInitScript(actor => {
    localStorage.setItem('localAuthSession', 'true'); localStorage.setItem('token', 'test'); localStorage.setItem('user', JSON.stringify(actor)); localStorage.setItem('o7_language', 'en');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => localStorage.setItem('copiedUrl', text) } });
  }, actor);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    let data: unknown = {};
    let status = 200;
    if (path === '/auth/me') data = { user: { userId: actor.id, tenantId: actor.tenantId } };
    else if (path === '/admin/context') data = { role: 'OWNER', canManageSubscriptions: true, ownsSubscriptions: true };
    else if (path === '/admin/subscriptions') data = [sub, { ...sub, id: 'no-email', customerName: 'No email account', contactEmail: null }, { ...sub, id: 'paused', customerName: 'Paused account', status: 'PAUSED' }];
    else if (path.endsWith('/users')) { userReads++; data = mode === 'member' || mode === 'race' && posts > 0 ? [{ id: 'client', email: sub.contactEmail.toUpperCase(), role: 'OWNER' }] : []; }
    else if (path.endsWith('/user-invites')) {
      if (route.request().method() === 'POST') { posts++; if (mode === 'race' || mode === 'blocked') { status = 400; data = { message: mode === 'race' ? 'This email is already a workspace member.' : 'Seat limit reached' }; } else data = { ...invite, token: 'new-token' }; }
      else data = mode === 'pending' ? [invite] : [];
    }
    else if (path === '/tenant/settings') data = { settings: { crmMode: 'B2B', crmDisplayCurrency: 'USD' } };
    else if (path === '/tenant/branding') data = { branding: {} };
    await route.fulfill({ status, json: data });
  });
  await page.goto('/admin/subscriptions');
  const row = page.getByRole('row').filter({ has: page.getByText('RHEO', { exact: true }) });
  await expect(row.getByRole('button', { name: 'Copy link', exact: true })).toBeVisible();
  return { row, posts: () => posts, userReads: () => userReads };
}

for (const mode of ['member', 'pending', 'new', 'race'] as const) {
  test(`restores and copies subscription access for ${mode}`, async ({ page }) => {
    const state = await setup(page, mode);
    await expect(state.row.getByRole('link').last()).toHaveAttribute('href', mode === 'pending' ? /inviteToken=existing-token/ : /\/login\?email=contact%40example.test/);
    expect(state.posts()).toBe(0);
    await state.row.getByRole('button', { name: 'Copy link', exact: true }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('copiedUrl'))).toContain(mode === 'member' || mode === 'race' ? '/login?email=contact%40example.test' : `inviteToken=${mode === 'pending' ? 'existing-token' : 'new-token'}`);
    expect(state.posts()).toBe(mode === 'new' || mode === 'race' ? 1 : 0);
    await expect(page.getByText(/This email is already a workspace member/)).toHaveCount(0);
    await page.reload();
    await expect(state.row.getByRole('link').last()).toBeVisible();
  });
}

test('copies a generic login link without email and disables inactive subscriptions', async ({ page }) => {
  const state = await setup(page, 'member');
  const noEmail = page.getByRole('row').filter({ has: page.getByText('No email account', { exact: true }) });
  await noEmail.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('copiedUrl'))).toMatch(/\/login$/);
  expect(state.posts()).toBe(0);
  const paused = page.getByRole('row').filter({ has: page.getByText('Paused account', { exact: true }) });
  await expect(paused.getByRole('button', { name: 'Copy link', exact: true })).toBeDisabled();
});

test('preserves real invitation errors instead of reporting a successful copy', async ({ page }) => {
  const { row } = await setup(page, 'blocked');
  await row.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.getByText(/Seat limit reached/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('copiedUrl'))).toBeNull();
});

test('login links prefill the recipient email', async ({ page }) => {
  await page.goto('/login?email=contact%40example.test');
  await expect(page.locator('input[type=email]')).toHaveValue(sub.contactEmail);
});
