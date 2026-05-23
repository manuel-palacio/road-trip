const express = require('express');
const { getAuth } = require('../lib/firebase');

const router = express.Router();

/** Defense-in-depth: this returns true if ANY signal hints at a hosted/
 * production environment. The list intentionally errs toward false
 * positives — if we don't recognize the host, assume the worst.
 *
 *   - K_SERVICE / K_REVISION / K_CONFIGURATION : Cloud Run (this project)
 *   - DYNO                                     : Heroku
 *   - FLY_APP_NAME                             : Fly.io
 *   - RAILWAY_ENVIRONMENT                      : Railway
 *   - NODE_ENV === 'production'                : explicit opt-in
 *
 * NODE_ENV is the LAST line of defence because it isn't set anywhere in
 * this project's Cloud Run config — relying on it alone would fail open.
 * Conversely, K_SERVICE is set automatically by Cloud Run on every
 * request, so it cannot be missed. */
function looksLikeProduction() {
  return !!(
    process.env.K_SERVICE ||
    process.env.K_REVISION ||
    process.env.K_CONFIGURATION ||
    process.env.DYNO ||
    process.env.FLY_APP_NAME ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.NODE_ENV === 'production'
  );
}

/** Express `req.ip` reflects the raw socket peer unless `trust proxy`
 * is enabled. server.js does NOT set trust proxy, so this is the actual
 * TCP source — on Cloud Run that's the Google load balancer's internal
 * IP, never loopback. No X-Forwarded-For spoofing possible. */
function isLoopback(req) {
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1';
}

/** POST /api/dev/auth/impersonate
 *
 * Mints a Firebase custom token for DEV_IMPERSONATE_UID so the client
 * can call `signInWithCustomToken` and continue through the normal auth
 * flow as that user.
 *
 * Safety: this router is only MOUNTED when isDevAuthAvailable() returns
 * true at server boot. The runtime checks below are belt-and-braces in
 * case the env changes between boot and request, or someone wires the
 * router into a production deployment by mistake. */
router.post('/api/dev/auth/impersonate', async (req, res) => {
  if (looksLikeProduction()) return res.status(404).end();
  if (!isLoopback(req)) return res.status(404).end();
  const uid = process.env.DEV_IMPERSONATE_UID;
  if (!uid) return res.status(404).end();

  try {
    const token = await getAuth().createCustomToken(uid);
    return res.json({ token });
  } catch (err) {
    console.error('[dev-auth] createCustomToken failed:', err.message);
    return res.status(500).json({ error: 'Failed to mint custom token' });
  }
});

/** Top-level switch the server uses to decide whether to mount the
 * router at all. The router is invisible in production: routes return
 * 404 because they don't exist in the Express app, not because they're
 * guarded. */
function isDevAuthAvailable() {
  if (looksLikeProduction()) return false;
  if (!process.env.DEV_IMPERSONATE_UID) return false;
  return true;
}

module.exports = { router, isDevAuthAvailable, looksLikeProduction };
