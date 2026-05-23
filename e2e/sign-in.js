// Per-session sign-in snippet for Playwright MCP. Invoke via:
//   browser_run_code_unsafe({ filename: "e2e/sign-in.js" })
//
// Hits the dev-impersonate endpoint (loopback-gated, see routes/dev-auth.js),
// clicks the Dev sign-in button on the landing page, and resolves when the
// app has routed away from "/". The MCP wrapper expects a single function
// expression — no statements, no trailing semicolon.
async (page) => {
  await page.goto('http://localhost:5173/');
  const button = page.getByRole('button', { name: /Dev sign-in/i });
  try {
    await button.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    return { ok: false, reason: 'Dev sign-in button missing — is npm run dev running on :5173?' };
  }
  await button.click();
  try {
    await page.waitForURL((url) => url.pathname !== '/', { timeout: 15000 });
  } catch {
    return { ok: false, reason: 'Sign-in did not complete — check server log for "[dev-auth] impersonation enabled".' };
  }
  return { ok: true, url: page.url() };
}
