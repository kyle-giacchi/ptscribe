import { test, expect } from '@playwright/test';

test('app loads without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  expect(errors).toEqual([]);
});

// e2e runs in demo mode (see playwright.config.ts), where the first-run wizard is
// bypassed: a fresh visitor lands on the public landing page instead.
test('fresh visit lands on the landing page and survives reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');

  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Better care, less work.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try Demo' }).first()).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
