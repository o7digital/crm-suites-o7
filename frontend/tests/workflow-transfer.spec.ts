import { expect, test } from '@playwright/test';

test('ADD drop selects a workflow, cancels safely, and retries a failed transfer', async ({ page }) => {
  let deal = { id: 'transfer-test', title: 'Monthly transfer', value: 3500, currency: 'USD', pipelineId: 'source', stageId: 'source-stage', status: 'OPEN', recurrenceGroupId: 'group', recurrenceIndex: 1, recurrenceMonths: 36 };
  const mutations: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('localAuthSession', 'true');
    localStorage.setItem('token', 'test');
    localStorage.setItem('user', JSON.stringify({ id: 'user', tenantId: 'tenant', email: 'test@example.test', role: 'OWNER' }));
    localStorage.setItem('o7_language', 'en');
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    let data: unknown = [];
    let status = 200;
    if (path === '/auth/me') data = { user: { userId: 'user', tenantId: 'tenant' } };
    else if (path === '/admin/context') data = { role: 'OWNER', canManageSubscriptions: false };
    else if (path === '/tenant/settings') data = { settings: { crmMode: 'B2B', crmDisplayCurrency: 'USD' } };
    else if (path === '/tenant/branding') data = { branding: {} };
    else if (path === '/pipelines') data = [{ id: 'source', name: 'Source', isDefault: true }, { id: 'target', name: 'Destination' }];
    else if (path === '/stages') {
      const pipelineId = url.searchParams.get('pipelineId');
      if (pipelineId === 'target') await new Promise((resolve) => setTimeout(resolve, 400));
      data = [
        { id: `${pipelineId}-stage`, name: 'Lead', pipelineId, position: 1, status: 'OPEN', probability: .05 },
        { id: `${pipelineId}-won`, name: 'Won', pipelineId, position: 2, status: 'WON', probability: 1 },
      ];
    } else if (path === '/deals') data = url.searchParams.get('pipelineId') === deal.pipelineId ? [deal] : [];
    else if (path === '/deals/transfer-test' && route.request().method() === 'PATCH') {
      mutations.push(route.request().postDataJSON());
      if (mutations.length === 1) { status = 400; data = { message: 'Temporary transfer error' }; }
      else { deal = { ...deal, ...route.request().postDataJSON() }; data = deal; }
    }
    await route.fulfill({ status, json: data });
  });

  await page.goto('/crm');
  const drop = async () => {
    const card = page.getByTestId('deal-card-transfer-test');
    await expect(card).toBeVisible();
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await card.dispatchEvent('dragstart', { dataTransfer });
    await expect(page.getByTestId('close-zone-WON')).toBeVisible();
    await expect(page.getByTestId('close-zone-LOST')).toBeVisible();
    await page.getByTestId('workflow-zone-ADD').dispatchEvent('drop', { dataTransfer });
    await dataTransfer.dispose();
  };
  await drop();
  const dialog = page.getByRole('dialog', { name: 'ADD · WFL' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'ADD', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(mutations).toHaveLength(0);
  await drop();
  await dialog.getByLabel('WFL · Pipeline').selectOption('target');
  await expect(dialog.getByRole('combobox', { name: 'Stage', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('combobox', { name: 'Stage', exact: true })).toHaveValue('target-stage');
  await expect(dialog.locator('option[value="target-won"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'ADD', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Temporary transfer error');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'ADD', exact: true }).click();
  await expect(page).toHaveURL(/pipelineId=target/);
  expect(mutations[1]).toEqual({ pipelineId: 'target', stageId: 'target-stage' });
  await page.reload();
  await expect(page.getByTestId('deal-card-transfer-test')).toBeVisible();
  expect(deal.recurrenceMonths).toBe(36);
  expect(errors).toEqual([]);
});
