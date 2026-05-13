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
app.use(shareRouter);
app.use(templatesRouter);

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
