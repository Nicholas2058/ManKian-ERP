import { test, expect } from '@playwright/test';

// Launch Chromium without WebGL to verify the accessible 2D floor-plan fallback.
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'] } });

test('warehouse shows the 2D plan when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mk-erp-prefs', JSON.stringify({ state: { onboardingDone: true, theme: 'light' }, version: 1 })));
  await page.goto('/warehouse');
  await expect(page.getByText('WebGL unavailable').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('group', { name: /floor plan/ })).toBeVisible();
  await page.getByRole('button', { name: /^A02 bay/ }).first().click();
  await expect(page.getByText(/In this bin|Empty bin/).first()).toBeVisible();
});
