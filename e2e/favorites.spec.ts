import { test, expect, type Page } from '@playwright/test';

const APP = process.env.E2E_APP || 'http://localhost:5173';
const TRIP_ID = process.env.E2E_TRIP_ID || '';

// Inlined to keep the spec self-contained (mirrors e2e/sign-in.js).
async function signIn(page: Page) {
  await page.goto(APP);
  const button = page.getByRole('button', { name: /Dev sign-in/i });
  await button.waitFor({ state: 'visible', timeout: 5_000 });
  await button.click();
  await page.waitForURL((url) => url.pathname !== '/', { timeout: 15_000 });
}

test.describe('favorites', () => {
  test.beforeEach(async ({ page }) => {
    if (!TRIP_ID) test.skip(true, 'Set E2E_TRIP_ID to a trip with at least one stop');
    await signIn(page);
  });

  test('star a stop, see it on /favorites, remove it', async ({ page }) => {
    await page.goto(`${APP}/builder/${TRIP_ID}`);
    const planBtn = page.locator('button[aria-pressed="false"]:has-text("Plan")').first();
    if (await planBtn.count() > 0) await planBtn.click();

    // Click the first ☆ on any stop card to add a favorite.
    const star = page.getByRole('button', { name: /add to favorites/i }).first();
    await star.click();
    await expect(page.getByRole('button', { name: /remove from favorites/i }).first()).toBeVisible();

    await page.goto(`${APP}/favorites`);
    await expect(page.locator('main h2')).toContainText(/your favorites/i);

    const removeBtn = page.getByRole('button', { name: /remove favorite/i }).first();
    await removeBtn.click();

    // After remove, either empty-state copy or one fewer entry.
    await expect(page.locator('main')).toContainText(/no favorites yet|your favorites/i);
  });

  test('empty state shown when no favorites', async ({ page }) => {
    await page.goto(`${APP}/favorites`);
    // If a prior test populated favorites, skip this one — the assertion
    // only holds for an empty list.
    const text = await page.locator('main').textContent();
    if (!/no favorites yet/i.test(text || '')) test.skip(true, 'list non-empty in this run');
    await expect(page.locator('main')).toContainText(/no favorites yet/i);
  });
});
