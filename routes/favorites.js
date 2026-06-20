const crypto = require('crypto');
const express = require('express');
const { admin, getDb } = require('../lib/firebase');
const { authRequired } = require('../middleware/auth');
const limits = require('../middleware/rate-limit');

const FAVORITES_PER_USER_LIMIT = 500;

const router = express.Router();
router.use('/api/favorites', authRequired);

const PIN_CATEGORIES = ['food', 'hotel', 'scenic', 'fuel', 'landmark', 'other'];

function sigKey(body) {
  if (body.placeId) return `pid:${body.placeId}`;
  return `coord:${body.name}|${body.lat.toFixed(4)}|${body.lng.toFixed(4)}`;
}

function favoriteDocId(uid, key) {
  return uid + '_' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

function validateFavoritePayload(body) {
  if (typeof body.name !== 'string' || !body.name.trim()) return { error: 'name required' };
  if (typeof body.lat !== 'number' || !Number.isFinite(body.lat)) return { error: 'lat required' };
  if (typeof body.lng !== 'number' || !Number.isFinite(body.lng)) return { error: 'lng required' };
  if (body.category != null && !PIN_CATEGORIES.includes(body.category)) {
    return { error: 'invalid category' };
  }
  const out = {
    name: body.name.trim().slice(0, 80),
    label: typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : body.name.trim().slice(0, 80),
    lat: body.lat,
    lng: body.lng,
  };
  if (typeof body.placeId === 'string' && body.placeId) out.placeId = body.placeId.slice(0, 128);
  if (typeof body.countryCode === 'string' && body.countryCode) out.countryCode = body.countryCode.slice(0, 8);
  if (body.category) out.category = body.category;
  if (typeof body.sourceTripId === 'string') out.sourceTripId = body.sourceTripId.slice(0, 64);
  if (typeof body.sourceTripName === 'string') out.sourceTripName = body.sourceTripName.slice(0, 80);
  return { value: out };
}

router.get('/api/favorites', async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('favorites').where('ownerUid', '==', req.uid).get();
    const favorites = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    res.json({ favorites });
  } catch (e) {
    console.error('GET /api/favorites failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.post('/api/favorites', limits.favoriteCreate, async (req, res) => {
  try {
    const { error, value } = validateFavoritePayload(req.body || {});
    if (error) return res.status(400).json({ error, code: 'INVALID' });
    const db = getDb();

    const countSnap = await db.collection('favorites').where('ownerUid', '==', req.uid).count().get();
    if (countSnap.data().count >= FAVORITES_PER_USER_LIMIT) {
      return res.status(402).json({
        error: `Favorites limit reached (${FAVORITES_PER_USER_LIMIT}). Remove some to add new ones.`,
        code: 'FAVORITES_LIMIT_REACHED',
        limit: FAVORITES_PER_USER_LIMIT,
      });
    }

    const docId = favoriteDocId(req.uid, sigKey(value));
    const ref = db.collection('favorites').doc(docId);
    const existing = await ref.get();
    if (existing.exists) return res.json({ id: docId, ...existing.data() });

    const favorite = {
      ownerUid: req.uid,
      ...value,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(favorite);
    const snap = await ref.get();
    res.status(201).json({ id: docId, ...snap.data() });
  } catch (e) {
    console.error('POST /api/favorites failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.delete('/api/favorites/:id', async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('favorites').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    if (snap.data().ownerUid !== req.uid) return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    await ref.delete();
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/favorites/:id failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
