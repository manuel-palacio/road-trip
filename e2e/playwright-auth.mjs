#!/usr/bin/env node
// One-time setup script: opens a Chromium browser, signs in via the
// dev-impersonate flow, and saves the storage state (cookies +
// localStorage + IndexedDB) to e2e/.auth/state.json.
//
// USAGE
//   1. Make sure `npm run dev` is running and DEV_IMPERSONATE_UID is set in .env
//   2. Install Playwright (one-time): npm install -D playwright
//   3. Run:                            node e2e/playwright-auth.mjs
//
// The saved state can then be passed to @playwright/mcp via the
// --storage-state flag so every MCP session starts already signed in.
// See CLAUDE.md ("Dev sign-in") for the full workflow.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = resolve(SCRIPT_DIR, '.auth/state.json');
const APP_URL = process.env.APP_URL || 'http://localhost:5173/';

async function main() {
  mkdirSync(dirname(STATE_PATH), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`→ Opening ${APP_URL}`);
  await page.goto(APP_URL);

  // The Dev sign-in button is only rendered when import.meta.env.DEV is
  // true (Vite dev mode). It calls /api/dev/auth/impersonate then signs
  // in with the returned custom token.
  const devSignIn = page.getByRole('button', { name: /Dev sign-in/i });
  try {
    await devSignIn.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    throw new Error(
      'Dev sign-in button not found. Two likely causes:\n' +
      '  1. The dev server is not running on ' + APP_URL + '\n' +
      '  2. The button is gated on `import.meta.env.DEV` — make sure you\n' +
      '     hit the Vite dev server (port 5173), not the production build.',
    );
  }

  console.log('→ Clicking Dev sign-in');
  await devSignIn.click();

  // After successful sign-in the app routes away from the landing page.
  // We just wait until the URL is no longer "/" to confirm Firebase
  // accepted the custom token and the auth listener fired.
  await page.waitForURL((url) => url.pathname !== '/', { timeout: 15_000 }).catch(() => {
    throw new Error(
      'Sign-in did not complete in time. Check the server log for\n' +
      '"[dev-auth] impersonation enabled for uid: …" — if missing,\n' +
      'DEV_IMPERSONATE_UID is unset or the server has not been restarted.',
    );
  });

  console.log('→ Sign-in confirmed; saving storage state');
  // indexedDB: true is the critical bit — Firebase Auth v9+ persists the
  // refresh token in IndexedDB by default. Without this flag, the saved
  // state would be missing the very thing we want to preserve.
  await context.storageState({ path: STATE_PATH, indexedDB: true });

  await browser.close();
  console.log(`✔ Saved auth state to ${STATE_PATH}`);
  console.log('');
  console.log('Pass this file to @playwright/mcp via --storage-state, or use');
  console.log('e2e/sign-in.js for a fresh sign-in each MCP session.');
}

main().catch((err) => {
  console.error('✗ playwright-auth failed:', err.message);
  process.exit(1);
});
