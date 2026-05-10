const express = require('express');
const { admin, getDb } = require('../lib/firebase');

const router = express.Router();

// Public — no auth middleware. Returns a sanitized trip view by share token.
router.get('/api/share/:shareToken', async (req, res) => {
  try {
    const db = getDb();
    const snap = await db
      .collection('trips')
      .where('shareToken', '==', req.params.shareToken)
      .limit(1)
      .get();
    if (snap.empty) {
      return res.status(404).json({ error: 'Share link not found', code: 'NOT_FOUND' });
    }
    const doc = snap.docs[0];
    const data = doc.data();
    if (!data.isShared) {
      return res.status(404).json({ error: 'Share link revoked', code: 'NOT_FOUND' });
    }

    const pinsSnap = await doc.ref.collection('pins').orderBy('createdAt', 'asc').get();
    const pins = pinsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    let owner = { displayName: 'A traveller', photoURL: '' };
    try {
      const u = await admin.auth().getUser(data.ownerUid);
      owner = {
        displayName: u.displayName || u.email || 'A traveller',
        photoURL: u.photoURL || '',
      };
    } catch (_) {
      // Owner record gone — keep defaults rather than failing the share.
    }

    // Strip private fields (ownerUid, collaborators) and shareToken (so it can't
    // be passed around from the response body).
    const trip = {
      id: doc.id,
      name: data.name || 'Untitled trip',
      description: data.description || '',
      coverEmoji: data.coverEmoji || '🚗',
      startDate: data.startDate || null,
      maxKmPerDay: data.maxKmPerDay || 600,
      stops: Array.isArray(data.stops) ? data.stops : [],
      totalKm: data.totalKm || 0,
      totalDays: data.totalDays || 0,
      countries: data.countries || [],
    };

    res.json({ trip, pins, owner });
  } catch (e) {
    console.error('GET /api/share/:shareToken failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
