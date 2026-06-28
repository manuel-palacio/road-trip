// Nearby Search daily-guardrail E2E spec.
//
// Requires Playwright test runner (`npm install -D @playwright/test`) and a
// dev server on :5173 with DEV_IMPERSONATE_UID set AND
// FREE_NEARBY_SEARCH_DAILY_LIMIT=1 so the second search trips the cap.
// Set E2E_TRIP_ID to a trip you own with at least one day to search around.
//
// The limit resolver is unit-tested in
// client/src/lib/__tests__/nearby-search-limit.test.ts. This spec covers the
// wired browser behavior. Status: written but un-runnable until
// @playwright/test is installed; equivalent live verification performed via
// Playwright MCP during implementation.

import { test, expect, type Page } from '@playwright/test';

const APP = process.env.E2E_APP || 'http://localhost:5173';
const TRIP_ID = process.env.E2E_TRIP_ID || '';

async function signIn(page: Page) {
  await page.goto(APP);
  const button = page.getByRole('button', { name: /Dev sign-in/i });
  await button.waitFor({ state: 'visible', timeout: 5_000 });
  await button.click();
  await page.waitForURL((url) => url.pathname !== '/', { timeout: 15_000 });
}

test.describe('nearby-search guardrail', () => {
  test.beforeEach(async ({ page }) => {
    if (!TRIP_ID) test.skip(true, 'Set E2E_TRIP_ID');
    await signIn(page);
  });

  test('second NearbyFinder search is blocked with the cap message', async ({ page }) => {
    await page.goto(`${APP}/builder/${TRIP_ID}`);

    // Open NearbyFinder for a day, let the first search run (allowed at limit=1).
    await page.getByRole('button', { name: /Find nearby/i }).first().click();
    await expect(page.locator('[data-testid="nearby-result"]').first())
      .toBeVisible({ timeout: 8_000 });
    await page.keyboard.press('Escape');

    // Open it again — the claim now exceeds the daily cap of 1.
    await page.getByRole('button', { name: /Find nearby/i }).first().click();
    await expect(page.getByText('Daily map search limit reached. Resets tomorrow.'))
      .toBeVisible({ timeout: 8_000 });
  });
});
