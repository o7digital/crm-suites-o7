import { expect, test } from '@playwright/test';

for (const view of ['modal', 'detail']) {
  test(`manual probability persists when matching the stage and changing stage (${view})`, async ({ page }) => {
    const stages = [
      { id: 's1', name: 'Lead', pipelineId: 'p1', position: 1, status: 'OPEN', probability: .55 },
      { id: 's2', name: 'Qualified', pipelineId: 'p1', position: 2, status: 'OPEN', probability: .8 },
    ];
    let deal = { id: 'd1', title: 'Manual probability', value: 1000, currency: 'USD', pipelineId: 'p1', stageId: 's1', status: 'OPEN', probability: null as number | null, stage: stages[0] };
    const mutations: Record<string, unknown>[] = [];
    await page.addInitScript(() => {
      localStorage.setItem('localAuthSession', 'true');
      localStorage.setItem('token', 'test');
      localStorage.setItem('user', JSON.stringify({ id: 'u1', tenantId: 't1', role: 'OWNER', email: 'test@example.test' }));
      localStorage.setItem('o7_language', 'en');
    });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
      let data: unknown = [];
      if (path === '/auth/me') data = { user: { userId: 'u1', tenantId: 't1' } };
      else if (path === '/admin/context') data = { role: 'OWNER' };
      else if (path === '/tenant/settings') data = { settings: { crmMode: 'B2B', crmDisplayCurrency: 'USD' } };
      else if (path === '/tenant/branding') data = { branding: {} };
      else if (path === '/pipelines') data = [{ id: 'p1', name: 'Sales', isDefault: true }];
      else if (path === '/stages') data = stages;
      else if (path === '/deals') data = [deal];
      else if (path === '/deals/d1') {
        if (route.request().method() === 'PATCH') {
          const body = route.request().postDataJSON();
          mutations.push(body);
          deal = { ...deal, ...body, stage: stages.find(s => s.id === body.stageId) || deal.stage };
        }
        data = deal;
      }
      await route.fulfill({ json: data });
    });
    await page.goto(view === 'modal' ? '/crm?pipelineId=p1&dealId=d1' : '/crm/deal/d1');
    const probability = page.getByRole('spinbutton', { name: /^Probability/ });
    await expect(probability).toHaveValue('55');
    await probability.fill('70');
    await probability.fill('55');
    await page.getByRole('combobox', { name: 'Stage', exact: true }).selectOption('s2');
    await expect(probability).toHaveValue('55');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => mutations.length).toBe(1);
    expect(mutations[0].probability).toBe(.55);
    await page.reload();
    if (view === 'modal') await page.goto('/crm?pipelineId=p1&dealId=d1');
    await expect(probability).toHaveValue('55');
  });
}

test('monthly forecast weights each deal before currency conversion and updates after saving', async ({ page }) => {
    const stages = [
      { id: 's1', name: 'Lead', pipelineId: 'p1', position: 1, status: 'OPEN', probability: .55 },
      { id: 's2', name: 'Qualified', pipelineId: 'p1', position: 2, status: 'OPEN', probability: .8 },
    ];
    let deal = { expectedCloseDate: '2026-10-20', id: 'd1', title: 'Manual probability', value: 50000, currency: 'MXN', pipelineId: 'p1', stageId: 's1', status: 'OPEN', probability: .02 as number | null, stage: stages[0] };
    const mutations: Record<string, unknown>[] = [];
    await page.addInitScript(() => {
      localStorage.setItem('localAuthSession', 'true');
      localStorage.setItem('token', 'test');
      localStorage.setItem('user', JSON.stringify({ id: 'u1', tenantId: 't1', role: 'OWNER', email: 'test@example.test' }));
      localStorage.setItem('o7_language', 'en');
    });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
      let data: unknown = [];
      if (path === '/auth/me') data = { user: { userId: 'u1', tenantId: 't1' } };
      else if (path === '/admin/context') data = { role: 'OWNER' };
      else if (path === '/tenant/settings') data = { settings: { crmMode: 'B2B', crmDisplayCurrency: 'USD' } };
      else if (path === '/tenant/branding') data = { branding: {} };
      else if (path === '/pipelines') data = [{ id: 'p1', name: 'Sales', isDefault: true }];
      else if (path === '/stages') data = stages;
      else if (path === '/fx/usd') data = { base: 'USD', rates: { USD: 1, MXN: 20 }, date: '2026-10-17' };
      else if (path === '/deals') data = [deal];
      else if (path === '/deals/d1') {
        if (route.request().method() === 'PATCH') {
          const body = route.request().postDataJSON();
          mutations.push(body);
          deal = { ...deal, ...body, stage: stages.find(s => s.id === body.stageId) || deal.stage };
        }
        data = deal;
      }
      await route.fulfill({ json: data });
    });

    await page.goto('/crm?pipelineId=p1');
    await page.getByRole('button', { name: 'Forecast', exact: true }).click();
    await page.locator('select').filter({ has: page.locator('option[value="2026"]') }).selectOption('2026');
    const october = page.getByTestId('forecast-month-10');
    await expect(october).toContainText('Weighted total: $50');
    await expect(october).toContainText('2%');
    await october.getByRole('button', { name: /Manual probability/ }).click();
    const probability = page.getByRole('spinbutton', { name: /^Probability/ });
    await probability.fill('0');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(october).toContainText('Weighted total: $0');
    await october.getByRole('button', { name: /Manual probability/ }).click();
    await probability.fill('100');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(october).toContainText('Weighted total: $2,500');
    deal.probability = null;
    await page.reload();
    await page.getByRole('button', { name: 'Forecast', exact: true }).click();
    await expect(october).toContainText('Weighted total: $1,375');
});

test('CRM remembers the selected currency after refresh and returning to the page', async ({ page }) => {
    const stages = [
      { id: 's1', name: 'Lead', pipelineId: 'p1', position: 1, status: 'OPEN', probability: .55 },
      { id: 's2', name: 'Qualified', pipelineId: 'p1', position: 2, status: 'OPEN', probability: .8 },
    ];
    let deal = { id: 'd1', title: 'Manual probability', value: 1000, currency: 'USD', pipelineId: 'p1', stageId: 's1', status: 'OPEN', probability: null as number | null, stage: stages[0] };
    const mutations: Record<string, unknown>[] = [];
    await page.addInitScript(() => {
      localStorage.setItem('localAuthSession', 'true');
      localStorage.setItem('token', 'test');
      localStorage.setItem('user', JSON.stringify({ id: 'u1', tenantId: 't1', role: 'OWNER', email: 'test@example.test' }));
      localStorage.setItem('o7_language', 'en');
    });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
      let data: unknown = [];
      if (path === '/auth/me') data = { user: { userId: 'u1', tenantId: 't1' } };
      else if (path === '/admin/context') data = { role: 'OWNER' };
      else if (path === '/tenant/settings') {
        await new Promise(resolve => setTimeout(resolve, 300));
        data = { settings: { crmMode: 'B2B', crmDisplayCurrency: 'USD' } };
      }
      else if (path === '/tenant/branding') data = { branding: {} };
      else if (path === '/pipelines') data = [{ id: 'p1', name: 'Sales', isDefault: true }];
      else if (path === '/stages') data = stages;
      else if (path === '/fx/usd') data = { base: 'USD', rates: { USD: 1, MXN: 20, EUR: .9 }, date: '2026-10-17' };
      else if (path === '/deals') data = [deal];
      else if (path === '/deals/d1') {
        if (route.request().method() === 'PATCH') {
          const body = route.request().postDataJSON();
          mutations.push(body);
          deal = { ...deal, ...body, stage: stages.find(s => s.id === body.stageId) || deal.stage };
        }
        data = deal;
      }
      await route.fulfill({ json: data });
    });

    await page.goto('/crm');
    const currency = page.getByRole('combobox', { name: 'Currency', exact: true });
    await expect(currency).toHaveValue('USD');
    await currency.selectOption('MXN');
    await expect(currency).toHaveValue('MXN');
    const settings = page.waitForResponse(response => response.url().includes('/tenant/settings'));
    await page.reload();
    await settings;
    await expect(currency).toHaveValue('MXN');
    await page.goto('/clients');
    const returningSettings = page.waitForResponse(response => response.url().includes('/tenant/settings'));
    await page.goto('/crm');
    await returningSettings;
    await expect(currency).toHaveValue('MXN');
    await currency.selectOption('EUR');
    const nextSettings = page.waitForResponse(response => response.url().includes('/tenant/settings'));
    await page.reload();
    await nextSettings;
    await expect(currency).toHaveValue('EUR');
});
