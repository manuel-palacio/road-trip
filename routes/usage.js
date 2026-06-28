const express = require('express');
const { FieldValue } = require('firebase-admin/firestore');
const { getDb } = require('../lib/firebase');
const { authRequired } = require('../middleware/auth');
const limits = require('../middleware/rate-limit');
const { effectiveNearbySearchDailyLimit } = require('../lib/limits');

const router = express.Router();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

function utcDateKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

router.use('/api/usage', authRequired);

// Cooperative metering gate for client-side Google Nearby Search calls. The
// client claims one unit before each search; we count per user per UTC day
// and refuse once the daily cap is exceeded. Not a security boundary — the
// Maps key lives in the browser — but it throttles a misbehaving user and
// bounds worst-case daily Places spend.
router.post('/api/usage/nearby-search', limits.usageWrite, async (req, res) => {
  try {
    if (ADMIN_EMAIL && (req.userEmail || '').toLowerCase() === ADMIN_EMAIL) {
      return res.json({ used: 0, limit: -1 });
    }
    const db = getDb();
    const userRef = db.collection('users').doc(req.uid);
    const usageRef = userRef.collection('usage').doc(utcDateKey());
    await usageRef.set({ nearbySearch: FieldValue.increment(1) }, { merge: true });
    const used = (await usageRef.get()).data()?.nearbySearch || 0;
    const userSnap = await userRef.get();
    const limit = effectiveNearbySearchDailyLimit(userSnap.data() || {});
    if (used > limit) {
      return res.status(402).json({
        error: 'Daily map search limit reached. Resets tomorrow.',
        code: 'NEARBY_SEARCH_LIMIT',
        used,
        limit,
      });
    }
    res.json({ used, limit });
  } catch (e) {
    console.error('POST /api/usage/nearby-search failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
