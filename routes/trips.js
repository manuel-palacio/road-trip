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
  'maxKmPerDay',
  'stops',
  'totalKm',
  'totalDays',
  'countries',
];

const PIN_CATEGORIES = ['food', 'hotel', 'scenic', 'fuel', 'landmark', 'other'];
const PIN_PRIORITIES = ['must', 'want', 'maybe'];
const PIN_UPDATABLE_FIELDS = ['name', 'category', 'notes', 'lat', 'lng', 'priority'];

function validatePinPayload(body, { partial }) {
  const out = {};
  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return { error: 'name is required' };
    }
    out.name = body.name.trim().slice(0, 80);
  } else if (!partial) {
    return { error: 'name is required' };
  }
  if ('category' in body) {
    if (!PIN_CATEGORIES.includes(body.category)) {
      return { error: `category must be one of: ${PIN_CATEGORIES.join(', ')}` };
    }
    out.category = body.category;
  } else if (!partial) {
    return { error: 'category is required' };
  }
  if ('notes' in body) {
    out.notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : '';
  } else if (!partial) {
    out.notes = '';
  }
  if ('priority' in body) {
    if (!PIN_PRIORITIES.includes(body.priority)) {
      return { error: `priority must be one of: ${PIN_PRIORITIES.join(', ')}` };
    }
    out.priority = body.priority;
  } else if (!partial) {
    out.priority = 'want';
  }
  if ('lat' in body) {
    if (typeof body.lat !== 'number' || !Number.isFinite(body.lat)) {
      return { error: 'lat must be a finite number' };
    }
    out.lat = body.lat;
  } else if (!partial) {
    return { error: 'lat is required' };
  }
  if ('lng' in body) {
    if (typeof body.lng !== 'number' || !Number.isFinite(body.lng)) {
      return { error: 'lng must be a finite number' };
    }
    out.lng = body.lng;
  } else if (!partial) {
    return { error: 'lng is required' };
  }
  return { value: out };
}

async function loadTripForAccess(req, res, requireWrite) {
  const db = getDb();
  const ref = db.collection('trips').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    return null;
  }
  const data = snap.data();
  const ok = requireWrite ? canWrite(data, req.uid) : canRead(data, req.uid);
  if (!ok) {
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    return null;
  }
  return ref;
}

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
      maxKmPerDay: typeof body.maxKmPerDay === 'number' && body.maxKmPerDay > 0 ? body.maxKmPerDay : 600,
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

router.get('/api/trips/:id/pins', async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, false);
    if (!ref) return;
    const snap = await ref.collection('pins').orderBy('createdAt', 'asc').get();
    const pins = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ pins });
  } catch (e) {
    console.error('GET /api/trips/:id/pins failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.post('/api/trips/:id/pins', async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, true);
    if (!ref) return;
    const { error, value } = validatePinPayload(req.body || {}, { partial: false });
    if (error) return res.status(400).json({ error, code: 'INVALID' });
    const pin = {
      ...value,
      addedByUid: req.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const pinRef = await ref.collection('pins').add(pin);
    const snap = await pinRef.get();
    res.status(201).json({ id: pinRef.id, ...snap.data() });
  } catch (e) {
    console.error('POST /api/trips/:id/pins failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.put('/api/trips/:id/pins/:pinId', async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, true);
    if (!ref) return;
    const pinRef = ref.collection('pins').doc(req.params.pinId);
    const pinSnap = await pinRef.get();
    if (!pinSnap.exists) return res.status(404).json({ error: 'Pin not found', code: 'NOT_FOUND' });
    const body = req.body || {};
    const filtered = {};
    for (const key of PIN_UPDATABLE_FIELDS) {
      if (key in body) filtered[key] = body[key];
    }
    const { error, value } = validatePinPayload(filtered, { partial: true });
    if (error) return res.status(400).json({ error, code: 'INVALID' });
    value.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await pinRef.update(value);
    const updated = await pinRef.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    console.error('PUT /api/trips/:id/pins/:pinId failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.delete('/api/trips/:id/pins/:pinId', async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, true);
    if (!ref) return;
    const pinRef = ref.collection('pins').doc(req.params.pinId);
    const pinSnap = await pinRef.get();
    if (!pinSnap.exists) return res.status(404).json({ error: 'Pin not found', code: 'NOT_FOUND' });
    await pinRef.delete();
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/trips/:id/pins/:pinId failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
