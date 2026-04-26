import { test, expect } from '@playwright/test';

test('app loads without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  expect(errors).toEqual([]);
});

test('first-run setup wizard -> dashboard -> persists on reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');

  // FirstRunGuard kicks us to /setup since clinician.name is empty.
  await expect(page).toHaveURL(/\/setup/);
  await expect(page.getByRole('heading', { name: 'Welcome.' })).toBeVisible();

  // Step 1: get started
  await page.getByRole('button', { name: /Get started/i }).click();

  // Step 2: profile — fill name, leave the rest
  await page.getByLabel('Your name', { exact: true }).fill('Dr. Alex Rivera');
  await page.getByLabel('Credentials', { exact: false }).first().fill('DPT, OCS');
  await page.getByRole('button', { name: /Next: AI providers/i }).click();

  // Step 3: AI keys — skip
  await page.getByRole('button', { name: /Finish setup/i }).click();

  // Step 4: done — go to dashboard
  await page.getByRole('button', { name: /Go to dashboard/i }).click();

  await expect(page).toHaveURL('http://localhost:8080/');
  await expect(page).not.toHaveURL(/\/setup/);

  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Patients' })).toBeVisible();

  await page.waitForFunction(() => localStorage.getItem('ptnotes.appData') !== null, {
    timeout: 5000,
  });

  await page.reload();
  await expect(page).not.toHaveURL(/\/setup/);
  await expect(page.getByRole('navigation')).toBeVisible();
});
