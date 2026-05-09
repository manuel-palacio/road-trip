require('dotenv').config();

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

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`roadtrip-map listening on :${PORT}`);
});
