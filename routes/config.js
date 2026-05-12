const express = require('express');

const router = express.Router();

// Explicit allowlist — never leak server-only env vars (Paddle keys,
// service-account fields, ALLOWED_EMAILS, etc.) even if FIREBASE_CLIENT_CONFIG
// is misconfigured to contain extras. Only these keys reach the browser.
const FIREBASE_CLIENT_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
  'measurementId',
];

router.get('/config', (req, res) => {
  let parsed = {};
  const raw = process.env.FIREBASE_CLIENT_CONFIG;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error('FIREBASE_CLIENT_CONFIG is not valid JSON:', e.message);
    }
  }
  const firebaseConfig = {};
  for (const k of FIREBASE_CLIENT_KEYS) {
    if (parsed[k] != null) firebaseConfig[k] = parsed[k];
  }

  res.json({
    firebaseConfig,
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    adminEmail: process.env.ADMIN_EMAIL || '',
  });
});

module.exports = router;
