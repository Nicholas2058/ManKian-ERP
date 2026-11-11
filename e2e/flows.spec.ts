import { test, expect, type Page } from '@playwright/test';

async function skipOnboarding(page: Page, role = 'owner') {
  await page.addInitScript((r) => {
    if (!localStorage.getItem('mk-erp-prefs')) localStorage.setItem('mk-erp-prefs', JSON.stringify({ state: { onboardingDone: true, theme: 'light', role: r }, version: 1 }));
  }, role);
}

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByText('Demo with fictional data').first()).toBeVisible({ timeout: 30_000 });
}

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
});
test.afterEach(() => {
  expect(errors, `console errors: ${errors.join('\n')}`).toEqual([]);
});

test('boots to the dashboard with onboarding and live KPIs (light theme by default)', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);
  await expect(page.getByRole('dialog', { name: /Welcome to the MK Hardware ERP demo/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Explore on my own' }).click();
  await expect(page.getByRole('heading', { name: 'Mission Control' })).toBeVisible();
  await expect(page.getByText('Net sales').first()).toBeVisible();
  await page.getByRole('radio', { name: '7 days' }).click();
  await expect(page.getByText(/invoices/).first()).toBeVisible();
});

test('global search finds a product and opens its detail', async ({ page }) => {
  await skipOnboarding(page);
  await ready(page, '/');
  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search records/).fill('ANG-5050');
  await page.getByRole('option', { name: /ANG-5050/ }).first().click();
  await expect(page).toHaveURL(/catalog\?id=p_ang5050/);
  await expect(page.getByText('Unit conversions (product-specific)')).toBeVisible();
});

test('daily cost shock → manager approval → new list price; sales exec cannot approve', async ({ page }) => {
  await skipOnboarding(page);
  await ready(page, '/pricing?tab=shock&sku=p_ang5050');
  await expect(page.getByText('Issued snapshot retained').first()).toBeVisible();
  await page.getByRole('button', { name: /Apply as supplier cost update/ }).click();
  await expect(page.getByText(/cost update\(s\) recorded/).first()).toBeVisible();
  // Sales Executive: no Approvals module — lands on their workspace, and the inbox shows an access screen
  await page.goto('/approvals');
  await page.getByRole('button', { name: /Demo role/ }).click();
  await page.getByRole('menuitem', { name: /Sales Executive/ }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Kevin/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Approvals/ })).toHaveCount(0);
  await page.goto('/approvals');
  await expect(page.getByRole('heading', { name: /Not part of the Sales Executive role/ })).toBeVisible();
  await page.getByRole('button', { name: /Switch to Sales Manager/ }).click();
  const card = page.locator('div.rounded-2xl', { hasText: 'ANG-5050 price' }).first();
  const finalPrice = await card.getByLabel('Final price').inputValue();
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/approved/).first()).toBeVisible();
  await page.goto('/pricing?sku=p_ang5050');
  await expect(page.locator('[data-tour="pricing-detail"]').getByText(`RM ${Number(finalPrice).toFixed(2)}`).first()).toBeVisible();
});

test('WhatsApp enquiry → RFQ → quotation PDF → order with partial reservation and backorder', async ({ page }) => {
  await skipOnboarding(page);
  await ready(page, '/enquiries');
  await page.getByRole('button', { name: /Rizal Hakim/ }).first().click();
  await expect(page.getByText(/PVE-050/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Create RFQ' }).click();
  await page.getByRole('button', { name: 'Create quotation' }).click();
  await expect(page).toHaveURL(/\/quotes\/qt_/);
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  const approve = page.getByRole('button', { name: 'Approve' });
  if (await approve.isVisible().catch(() => false)) await approve.click();
  await page.getByRole('button', { name: 'Issue quotation' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/QT-.*DEMO\.pdf/);
  await page.getByRole('button', { name: 'Mark accepted' }).click();
  await page.getByRole('button', { name: /Convert to sales order/ }).click();
  await page.getByRole('button', { name: 'Create sales order' }).click();
  await expect(page).toHaveURL(/orders\?id=/);
  await page.getByRole('button', { name: 'Reserve stock' }).click();
  await expect(page.getByText(/units backordered/).first()).toBeVisible();
  await expect(page.getByText('Backorder 15', { exact: false }).first()).toBeVisible();
});

test('procurement: receive goods on an open PO', async ({ page }) => {
  await skipOnboarding(page);
  await ready(page, '/procurement?tab=pos');
  await page.locator('tr', { hasText: 'Acknowledged' }).first().click();
  await page.getByRole('button', { name: /Receive goods/ }).click();
  await page.getByRole('button', { name: 'Post GRN' }).click();
  await expect(page.getByText(/GRN-.* posted/).first()).toBeVisible();
});

test('pick, pack, dispatch and confirm delivery with proof of delivery', async ({ page }) => {
  await skipOnboarding(page);
  await ready(page, '/inventory?tab=picking');
  await page.locator('li', { hasText: 'Teratai Build Works' }).getByRole('button', { name: 'Start picking' }).click();
  for (let i = 0; i < 6; i++) {
    const btn = page.getByRole('button', { name: /^Pick \d+/ }).first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await btn.click();
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: 'Pack as delivery' }).click();
  await expect(page).toHaveURL(/delivery\?id=/);
  await page.getByRole('button', { name: 'Schedule load' }).click();
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Dispatch' }).click();
  await page.getByRole('button', { name: 'Confirm delivery' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/POD recorded/).first()).toBeVisible();
});

test('changes persist after reload (IndexedDB)', async ({ page }) => {
  await skipOnboarding(page);
  await ready(page, '/quotes/new');
  await page.getByLabel(/Customer/).selectOption({ label: 'Halia Interiors · Trade' });
  await page.getByRole('button', { name: 'Create draft quotation' }).click();
  await expect(page).toHaveURL(/\/quotes\/qt_/);
  const heading = await page.locator('h1').first().textContent();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('h1').first()).toHaveText(heading!);
});

test('mobile viewport: bottom navigation, no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await skipOnboarding(page);
  await ready(page, '/');
  await expect(page.getByRole('navigation', { name: 'Quick navigation' })).toBeVisible();
  await page.waitForTimeout(1200);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(390);
  for (const path of ['/quotes', '/pricing', '/delivery', '/inventory', '/finance', '/warehouse']) {
    await ready(page, path);
    await page.waitForTimeout(1200); // let charts / tables settle
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390);
  }
});

test('3D warehouse renders a WebGL canvas and the bin panel agrees with inventory', async ({ page }) => {
  await skipOnboarding(page);
  await ready(page, '/warehouse');
  await expect(page.locator('[data-tour="warehouse-canvas"] canvas')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('radio', { name: 'Low stock' }).click();
  await page.getByRole('button', { name: /^A01/ }).click();
  await expect(page.getByText(/Available \(all bins\)|Empty bin/).first()).toBeVisible();
});

test('each role gets its own menu and home screen', async ({ page }) => {
  await skipOnboarding(page, 'picker');
  await ready(page, '/');
  await expect(page.getByRole('heading', { name: /Jason/ })).toBeVisible();
  const menu = page.getByRole('navigation', { name: 'Main' });
  await expect(menu.getByRole('link', { name: /Inventory/ })).toBeVisible();
  await expect(menu.getByRole('link', { name: /Pricing Command/ })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: /Receivables/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Demo role/ }).click();
  await page.getByRole('menuitem', { name: /Counter Cashier/ }).click();
  await expect(page.getByRole('heading', { name: /Nur/ })).toBeVisible();
  await expect(menu.getByRole('link', { name: /Counter POS/ })).toBeVisible();
  await expect(menu.getByRole('link', { name: /Inventory/ })).toHaveCount(0);
});

test('guided scenario spotlights the step target and greys out the rest', async ({ page }) => {
  await skipOnboarding(page);
  await ready(page, '/tour');
  await page.getByRole('button', { name: 'Start' }).first().click();
  await expect(page).toHaveURL(/\/pricing\?sku=/);
  const spot = page.getByTestId('tour-spotlight');
  await expect(spot).toBeVisible();
  // The cut-out settles around the target (it follows scrolling with a short transition)
  await expect
    .poll(async () => {
      const t = await page.locator('[data-tour="pricing-detail"]').boundingBox();
      const h = await spot.boundingBox();
      return !!t && !!h && h.x <= t.x && h.y <= Math.max(4, t.y) && h.x + h.width >= Math.min(t.x + t.width, 1280 - 4) - 1;
    })
    .toBe(true);
  // Clicks outside the highlighted area are blocked (sidebar link does nothing)
  await page.mouse.click(40, 300);
  await expect(page).toHaveURL(/\/pricing\?sku=/);
  // The tour panel itself stays usable above the dimmer
  await page.getByRole('dialog', { name: /Guided scenario A/ }).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/tab=shock/);
  await expect(page.getByTestId('tour-spotlight')).toBeVisible();
  // Esc minimises the tour and lifts the dimmer
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tour-spotlight')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Scenario A · step 2/ })).toBeVisible();
});
