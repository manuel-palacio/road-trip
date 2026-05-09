const express = require('express');

const router = express.Router();

router.get('/config', (req, res) => {
  let firebaseConfig = {};
  const raw = process.env.FIREBASE_CLIENT_CONFIG;
  if (raw) {
    try {
      firebaseConfig = JSON.parse(raw);
    } catch (e) {
      console.error('FIREBASE_CLIENT_CONFIG is not valid JSON:', e.message);
    }
  }

  res.json({
    firebaseConfig,
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    adminEmail: process.env.ADMIN_EMAIL || '',
  });
});

module.exports = router;
