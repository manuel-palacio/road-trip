const express = require('express');
const { admin, getDb } = require('../lib/firebase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.use('/api/trips', authRequired);

const UPDATABLE_FIELDS = [
  'name',
  'description',
  'coverEmoji',
  'startDate',
  'stops',
  'totalKm',
  'totalDays',
  'countries',
];

function canRead(data, uid) {
  return data.ownerUid === uid || (data.collaborators || []).includes(uid);
}

function canWrite(data, uid) {
  return canRead(data, uid);
}

function canDelete(data, uid) {
  return data.ownerUid === uid;
}

router.post('/api/trips', async (req, res) => {
  try {
    const db = getDb();
    const body = req.body || {};
    const trip = {
      ownerUid: req.uid,
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled trip',
      description: typeof body.description === 'string' ? body.description : '',
      coverEmoji: typeof body.coverEmoji === 'string' && body.coverEmoji ? body.coverEmoji : '🚗',
      startDate: typeof body.startDate === 'string' ? body.startDate : null,
      stops: Array.isArray(body.stops) ? body.stops : [],
      totalKm: 0,
      totalDays: 0,
      countries: [],
      collaborators: [],
      shareToken: null,
      isShared: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('trips').add(trip);
    const snap = await ref.get();
    res.status(201).json({ id: ref.id, ...snap.data() });
  } catch (e) {
    console.error('POST /api/trips failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.get('/api/trips', async (req, res) => {
  try {
    const db = getDb();
    const [ownedSnap, collabSnap] = await Promise.all([
      db.collection('trips').where('ownerUid', '==', req.uid).get(),
      db.collection('trips').where('collaborators', 'array-contains', req.uid).get(),
    ]);
    const map = new Map();
    for (const doc of [...ownedSnap.docs, ...collabSnap.docs]) {
      map.set(doc.id, { id: doc.id, ...doc.data() });
    }
    const trips = [...map.values()].sort((a, b) => {
      const ta = a.updatedAt?.toMillis?.() || 0;
      const tb = b.updatedAt?.toMillis?.() || 0;
      return tb - ta;
    });
    res.json({ trips });
  } catch (e) {
    console.error('GET /api/trips failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.get('/api/trips/:id', async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    const data = snap.data();
    if (!canRead(data, req.uid)) return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    res.json({ id: snap.id, ...data });
  } catch (e) {
    console.error('GET /api/trips/:id failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.put('/api/trips/:id', async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    if (!canWrite(snap.data(), req.uid)) return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });

    const body = req.body || {};
    const update = {};
    for (const key of UPDATABLE_FIELDS) {
      if (key in body) update[key] = body[key];
    }
    update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await ref.update(update);
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    console.error('PUT /api/trips/:id failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.delete('/api/trips/:id', async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    if (!canDelete(snap.data(), req.uid)) return res.status(403).json({ error: 'Owner only', code: 'FORBIDDEN' });

    const pinsSnap = await ref.collection('pins').get();
    const batch = db.batch();
    pinsSnap.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(ref);
    await batch.commit();
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/trips/:id failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
