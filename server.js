require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');

const { getDb } = require('./lib/firebase');
const configRouter = require('./routes/config');
const meRouter = require('./routes/me');
const tripsRouter = require('./routes/trips');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

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

// Serve the React build (or fall back to legacy public/ if dist/ isn't built yet locally)
const distPath = path.join(__dirname, 'dist');
const legacyPublic = path.join(__dirname, 'public');
const staticRoot = fs.existsSync(distPath) ? distPath : legacyPublic;
app.use(express.static(staticRoot));

// SPA fallback — any non-API path returns index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/config') || req.path.startsWith('/health') || req.path.startsWith('/actuator')) {
    return next();
  }
  const indexFile = path.join(staticRoot, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  return res.status(404).end();
});

app.listen(PORT, () => {
  console.log(`roadtrip-map listening on :${PORT} (serving ${path.basename(staticRoot)}/)`);
});
