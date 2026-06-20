// Auto-fuel feature E2E spec.
//
// Requires Playwright test runner (`npm install -D @playwright/test`) and a
// dev server running on :5173 with DEV_IMPERSONATE_UID set. Set E2E_TRIP_ID
// to a trip you own that has at least one leg whose km exceeds tankRangeKm
// (e.g. Stockholm → Hamburg via Ljungby fuel stop, with tankRangeKm=500).
//
// The hook itself is unit-tested in client/src/hooks/__tests__/useAutoFuel.test.tsx
// (7 tests). These specs cover the wired-up browser behavior: real Places
// API, real React state cycles, real layout-toggle interactions.
//
// Status: written but un-runnable until @playwright/test is installed. We
// performed equivalent live verification via Playwright MCP during
// implementation (see commits 92aa459 and 39b9e8a).

import { test, expect, type Page } from '@playwright/test';

const APP = process.env.E2E_APP || 'http://localhost:5173';
const TRIP_ID = process.env.E2E_TRIP_ID || '';

// Inlined equivalent of e2e/sign-in.js. The standalone file expresses the
// same flow as a bare async expression for Playwright MCP's
// browser_run_code_unsafe; we duplicate the logic here so the spec is
// self-contained and doesn't need eval.
async function signIn(page: Page) {
  await page.goto(APP);
  const button = page.getByRole('button', { name: /Dev sign-in/i });
  await button.waitFor({ state: 'visible', timeout: 5_000 });
  await button.click();
  await page.waitForURL((url) => url.pathname !== '/', { timeout: 15_000 });
}

test.describe('auto-fuel', () => {
  test.beforeEach(async ({ page }) => {
    if (!TRIP_ID) test.skip(true, 'Set E2E_TRIP_ID to a trip with a leg > tankRangeKm');
    await signIn(page);
  });

  test('inserts a fuel stop, shows the auto glyph, and does not loop', async ({ page }) => {
    await page.goto(`${APP}/builder/${TRIP_ID}`);
    // Switch to Plan layout — auto glyph and stop-cards are rendered there.
    const planBtn = page.locator('button[aria-pressed="false"]:has-text("Plan")').first();
    if (await planBtn.count() > 0) await planBtn.click();

    // Engine debounces ~600ms then runs; Places + state update follow.
    // Allow up to 5s for the auto stop to appear.
    await expect(page.locator('[data-testid="stop-card"]:has-text("auto")')).toBeVisible({ timeout: 5_000 });

    // Stability: sample the stop count over 6 seconds. A loop would show
    // the count oscillating between two values.
    const counts: number[] = [];
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(1500);
      counts.push(await page.locator('[data-testid="stop-card"]').count());
    }
    const unique = new Set(counts);
    expect(unique.size).toBe(1);
  });

  test('toggling Auto-fuel off in trip details prevents new auto-stops', async ({ page }) => {
    await page.goto(`${APP}/builder/${TRIP_ID}`);
    const planBtn = page.locator('button[aria-pressed="false"]:has-text("Plan")').first();
    if (await planBtn.count() > 0) await planBtn.click();

    // Open trip details modal — exact button varies; match by aria-label OR text.
    await page.getByRole('button', { name: /details|settings|trip/i }).first().click();
    const checkbox = page.getByRole('checkbox', { name: /auto-fuel/i });
    await checkbox.uncheck();
    await page.getByRole('button', { name: /save|done|close/i }).first().click();

    // Re-render: with auto-fuel off, engine should not insert. Capture the
    // current count then wait — count should not change.
    const before = await page.locator('[data-testid="stop-card"]').count();
    await page.waitForTimeout(2500);
    const after = await page.locator('[data-testid="stop-card"]').count();
    expect(after).toBe(before);
  });

  test('Undo button removes the inserted auto-stop', async ({ page }) => {
    await page.goto(`${APP}/builder/${TRIP_ID}`);
    const planBtn = page.locator('button[aria-pressed="false"]:has-text("Plan")').first();
    if (await planBtn.count() > 0) await planBtn.click();

    // Wait for the insertion + the undo toast.
    const undo = page.getByRole('button', { name: /^undo$/i });
    await expect(undo).toBeVisible({ timeout: 5_000 });

    const beforeCount = await page.locator('[data-testid="stop-card"]').count();
    await undo.click();

    // After undo, the stop count drops by at least 1 and no `auto` glyph remains.
    await expect(page.locator('[data-testid="stop-card"]:has-text("auto")')).toHaveCount(0);
    const afterCount = await page.locator('[data-testid="stop-card"]').count();
    expect(afterCount).toBeLessThan(beforeCount);
  });
});
