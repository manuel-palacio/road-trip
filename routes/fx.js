const express = require('express');
const { authRequired } = require('../middleware/auth');
const { admin, getDb } = require('../lib/firebase');

const router = express.Router();
router.use('/api/fx', authRequired);

router.get('/api/fx/:date', async (req, res) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD', code: 'INVALID' });
    }
    const db = getDb();
    const cacheRef = db.collection('fx_cache').doc(date);
    const cached = await cacheRef.get();
    if (cached.exists) {
      const { base, date: d, rates } = cached.data();
      return res.json({ base, date: d, rates });
    }
    const upstream = await fetch(
      `https://api.frankfurter.app/${encodeURIComponent(date)}?from=EUR`,
    );
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Upstream FX error', code: 'UPSTREAM' });
    }
    const data = await upstream.json();
    const payload = {
      base: data.base || 'EUR',
      date: data.date || date,
      rates: { ...data.rates, [data.base || 'EUR']: 1 },
      fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await cacheRef.set(payload);
    res.json({ base: payload.base, date: payload.date, rates: payload.rates });
  } catch (e) {
    console.error('GET /api/fx/:date failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
