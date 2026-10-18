import { expect, test } from '@playwright/test';

for (const fails of [false, true]) {
  test(`workflow deletion ${fails ? 'shows API errors without scrolling' : 'confirms, cancels, and switches to the remaining workflow'}`, async ({ page }) => {
    let deletes = 0;
    let pipelines = [{ id: 'p1', name: 'Projects France et Europe', isDefault: true }, { id: 'p2', name: 'Sales', isDefault: false }];
    await page.addInitScript(() => {
      localStorage.setItem('localAuthSession', 'true');
      localStorage.setItem('token', 'test');
      localStorage.setItem('user', JSON.stringify({ id: 'u1', tenantId: 't1', role: 'OWNER', email: 'test@example.test' }));
      localStorage.setItem('o7_language', 'en');
      window.confirm = () => { throw new Error('Native dialogs are unavailable'); };
    });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
      let data: unknown = [];
      if (path === '/auth/me') data = { user: { userId: 'u1', tenantId: 't1' } };
      else if (path === '/admin/context') data = { role: 'OWNER' };
      else if (path === '/tenant/settings') data = { settings: { crmMode: 'B2B', crmDisplayCurrency: 'USD' } };
      else if (path === '/tenant/branding') data = { branding: {} };
      else if (path === '/pipelines') data = pipelines;
      else if (path === '/stages') data = Array.from({ length: 15 }, (_, i) => ({ id: `s${i}`, name: `Stage ${i}`, pipelineId: 'p1', position: i, status: 'OPEN', probability: .1 }));
      else if (path === '/pipelines/p1' && route.request().method() === 'DELETE') {
        deletes++;
        if (fails) return route.fulfill({ status: 403, json: { message: 'Workspace administrator required' } });
        pipelines = pipelines.filter(p => p.id !== 'p1');
        data = { id: 'p1' };
      }
      await route.fulfill({ json: data });
    });
    await page.goto('/crm?pipelineId=p1');
    await page.getByRole('button', { name: 'Manage Workflow', exact: true }).first().click();
    const remove = page.getByRole('button', { name: 'Delete workflow', exact: true });
    await remove.click();
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toBeInViewport();
    await expect(confirmation).toContainText('Projects France et Europe');
    await expect(confirmation).toContainText('all its deals');
    expect(deletes).toBe(0);
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(confirmation).toBeHidden();
    expect(deletes).toBe(0);
    await remove.click();
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => deletes).toBe(1);
    if (fails) {
      await expect(page.getByRole('alert').filter({ hasText: 'Workspace administrator required' })).toBeInViewport();
      await expect(confirmation).toBeVisible();
    } else {
      await expect(confirmation).toBeHidden();
      await expect(page).toHaveURL(/pipelineId=p2/);
      await expect(page.locator('option[value="p1"]')).toHaveCount(0);
    }
  });
}
