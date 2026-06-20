require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');

const { getDb } = require('./lib/firebase');
const configRouter = require('./routes/config');
const meRouter = require('./routes/me');
const tripsRouter = require('./routes/trips');
const shareRouter = require('./routes/share');
const templatesRouter = require('./routes/templates');

const app = express();
const PORT = process.env.PORT || 8080;

// Trip payloads include per-stop persisted polyline paths (up to
// MAX_ROUTE_PATH_POINTS points each). A multi-day trip with many legs
// can exceed the Express 100kb default — bump generously, Cloud Run
// has no trouble with multi-MB JSON.
app.use(express.json({ limit: '5mb' }));

app.get(['/health', '/actuator/health'], (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/actuator/health/readiness', async (req, res) => {
  const TIMEOUT_MS = 3000;
  try {
    await Promise.race([
      getDb().doc('_health/_check').get(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('firestore timeout')), TIMEOUT_MS),
      ),
    ]);
    res.json({ status: 'ok', firestore: 'ok' });
  } catch (err) {
    console.error('Readiness check failed:', err.message);
    res.status(503).json({ status: 'down', firestore: 'down', error: err.message });
  }
});

app.use(configRouter);
app.use(meRouter);
app.use(tripsRouter);
app.use(shareRouter);
app.use(templatesRouter);
app.use(require('./routes/favorites'));
app.use(require('./routes/users'));
app.use(require('./routes/admin'));
app.use(require('./routes/fx'));

// Dev-only impersonation endpoint. Conditionally mounted — in any
// hosted environment (Cloud Run, Heroku, Fly, Railway, NODE_ENV=production)
// the router isn't loaded, so the endpoint doesn't exist. The router's
// own internal guards (loopback check, env-var check) are belt-and-braces.
const devAuth = require('./routes/dev-auth');
if (devAuth.isDevAuthAvailable()) {
  app.use(devAuth.router);
  console.log(`[dev-auth] impersonation enabled for uid: ${process.env.DEV_IMPERSONATE_UID}`);
} else if (process.env.DEV_IMPERSONATE_UID && devAuth.looksLikeProduction()) {
  // Loud warning: someone set the dev env var in a production-like
  // environment. The route is NOT mounted, but the env leak deserves
  // attention so the operator can clear it.
  console.warn('[dev-auth] DEV_IMPERSONATE_UID is set but environment looks production-like — endpoint NOT mounted.');
}

// Serve the React build
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// SPA fallback — any non-API path returns index.html so React Router can handle it
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/config') || req.path.startsWith('/health') || req.path.startsWith('/actuator')) {
    return next();
  }
  // /share/:token is a SPA route (the share page is rendered client-side,
  // which then calls /api/share/:token). Falls through to index.html below.
  const indexFile = path.join(distPath, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  return res.status(404).end();
});

app.listen(PORT, () => {
  console.log(`roadtrip-map listening on :${PORT}`);
});
