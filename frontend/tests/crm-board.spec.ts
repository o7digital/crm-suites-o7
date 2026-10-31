import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const stages = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, name: `Step ${i}`, position: i, status: 'OPEN', probability: .5, pipelineId: 'p1' }));
  let deal = { id: 'd1', title: 'Movable opportunity', value: 1000, currency: 'USD', pipelineId: 'p1', stageId: 's0', status: 'OPEN', expectedCloseDate: '2026-10-31', updatedAt: '2026-10-01T00:00:00.000Z', boardOrder: 0, stage: stages[0] };
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
    else if (path === '/deals/d1' || path === '/deals/d1/rank') {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        deal = { ...deal, ...body, stage: stages.find(s => s.id === body.stageId) || deal.stage, updatedAt: '2026-10-01T00:01:00.000Z' };
      }
      data = deal;
    }
    await route.fulfill({ json: data });
  });
  await page.goto('/crm?pipelineId=p1');
  await expect(page.getByTestId('deal-card-d1')).toBeVisible();
});

for (const view of ['kanban', 'forecast']) {
  test(`${view}: mouse pan, top navigation, wheel and card interactions`, async ({ page }) => {
    if (view === 'forecast') await page.getByRole('button', { name: 'Forecast', exact: true }).click();
    const board = page.getByTestId(`${view}-board`);
    const scrollbar = page.getByTestId(`${view}-board-scrollbar`);
    const heading = view === 'forecast' ? page.getByTestId('forecast-month-10').locator('p').first() : page.locator('#stage-s1 h3');
    await heading.scrollIntoViewIfNeeded();
    await board.evaluate(el => { el.scrollLeft = 0; });
    const initial = await board.evaluate(el => el.scrollLeft);
    const box = await heading.boundingBox();
    if (!box) throw new Error('Missing column header');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => board.evaluate(el => el.scrollLeft)).toBeGreaterThan(initial + 140);
    await expect.poll(async () => Math.abs(Number(await scrollbar.inputValue()) - await board.evaluate(el => el.scrollLeft))).toBeLessThan(2);
    await page.getByRole('button', { name: 'Scroll right', exact: true }).click();
    await expect.poll(() => board.evaluate(el => el.scrollLeft)).toBeGreaterThan(initial + 400);
    await scrollbar.focus();
    await scrollbar.press('Home');
    await expect.poll(() => board.evaluate(el => el.scrollLeft)).toBe(0);
    await board.hover();
    await page.mouse.wheel(100, 0);
    await expect.poll(() => board.evaluate(el => el.scrollLeft)).toBe(100);
    await board.evaluate(el => { el.scrollLeft = 0; });

    // Panning the background must leave native deal dragging and clicks intact.
    const card = view === 'forecast' ? page.getByRole('button', { name: /Movable opportunity/ }) : page.getByTestId('deal-card-d1');
    const target = view === 'forecast' ? page.getByTestId('forecast-month-11') : page.locator('#stage-s1');
    const mutation = page.waitForRequest(request => request.method() === 'PATCH' && request.url().includes('/deals/d1'));
    await card.dragTo(target);
    const body = (await mutation).postDataJSON();
    if (view === 'forecast') expect(body.expectedCloseDate).toBe('2026-11-30');
    else expect(body.stageId).toBe('s1');
    await expect(target.getByRole('button', { name: /Movable opportunity/ })).toBeVisible();
    // The Kanban intentionally ignores clicks for 250ms after a drop.
    await expect(async () => {
      await target.getByRole('button', { name: /Movable opportunity/ }).click();
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible({ timeout: 600 });
    }).toPass({ timeout: 5000 });
  });
}
