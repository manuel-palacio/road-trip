const express = require('express');
const { admin, getDb, getAuth } = require('../lib/firebase');
const { effectiveTripLimit } = require('../lib/limits');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 60;

// Curated subset of trip fields safe for the unauthenticated card grid.
// Anything not in this list is stripped from the response — keeps
// ownerUid / collaborators / shareToken / fuelPrice etc. private.
function templateCardFromTrip(id, trip, owner) {
  return {
    id,
    name: trip.name || 'Untitled trip',
    coverEmoji: trip.coverEmoji || '🚗',
    templateDescription: trip.templateDescription || '',
    templateTags: Array.isArray(trip.templateTags) ? trip.templateTags : [],
    totalKm: typeof trip.totalKm === 'number' ? trip.totalKm : 0,
    totalDays: typeof trip.totalDays === 'number' ? trip.totalDays : 0,
    countries: Array.isArray(trip.countries) ? trip.countries : [],
    cloneCount: typeof trip.cloneCount === 'number' ? trip.cloneCount : 0,
    publishedAt: trip.publishedAt || null,
    owner,
  };
}

async function resolveOwners(db, uids) {
  // One lookup per unique owner uid. Falls back to a generic display
  // when the auth record isn't available (e.g. the owner deleted their
  // account but the template still exists).
  const unique = [...new Set(uids.filter(Boolean))];
  const map = new Map();
  await Promise.all(unique.map(async (uid) => {
    try {
      const u = await getAuth().getUser(uid);
      map.set(uid, {
        displayName: u.displayName || (u.email ? u.email.split('@')[0] : 'A road tripper'),
        photoURL: u.photoURL || '',
      });
    } catch {
      map.set(uid, { displayName: 'A road tripper', photoURL: '' });
    }
  }));
  return map;
}

router.get('/api/templates', async (req, res) => {
  try {
    const db = getDb();
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE),
    );
    const tagFilter = typeof req.query.tag === 'string' && req.query.tag.trim()
      ? req.query.tag.trim().toLowerCase()
      : null;

    // Sort in JS instead of orderBy() so we don't need a Firestore
    // composite index for (isTemplate, cloneCount) — auto-indexes only
    // cover single fields, and adding a composite index is a manual
    // console step that breaks fresh deploys. Fetch a generous slice
    // to give the in-memory sort enough range, then trim to `limit`.
    const fetchSize = Math.min(MAX_PAGE_SIZE * 4, 240);
    let q = db.collection('trips')
      .where('isTemplate', '==', true)
      .limit(fetchSize);
    if (tagFilter) {
      q = q.where('templateTags', 'array-contains', tagFilter);
    }

    const snap = await q.get();
    const owners = await resolveOwners(db, snap.docs.map((d) => d.data().ownerUid));
    const items = snap.docs
      .map((d) =>
        templateCardFromTrip(d.id, d.data(), owners.get(d.data().ownerUid) || {
          displayName: 'A road tripper',
          photoURL: '',
        }),
      )
      .sort((a, b) => {
        const byClones = (b.cloneCount || 0) - (a.cloneCount || 0);
        if (byClones !== 0) return byClones;
        // Tiebreak: most recently published first. publishedAt is a
        // Firestore Timestamp serialised as { _seconds, _nanoseconds }.
        const aT = a.publishedAt && a.publishedAt._seconds || 0;
        const bT = b.publishedAt && b.publishedAt._seconds || 0;
        return bT - aT;
      })
      .slice(0, limit);
    res.json({ items });
  } catch (e) {
    console.error('GET /api/templates failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.post('/api/templates/:id/clone', authRequired, async (req, res) => {
  try {
    const db = getDb();
    const sourceRef = db.collection('trips').doc(req.params.id);
    const sourceSnap = await sourceRef.get();
    if (!sourceSnap.exists) {
      return res.status(404).json({ error: 'Template not found', code: 'NOT_FOUND' });
    }
    const source = sourceSnap.data();
    if (!source.isTemplate) {
      return res.status(404).json({ error: 'Template not found', code: 'NOT_FOUND' });
    }

    // Plan-limit enforcement reuses the same effective limit as create.
    // Both Free and Pro have caps; the message just shifts the upgrade
    // call-to-action vs. the contact-support fallback.
    const userSnap = await db.collection('users').doc(req.uid).get();
    const user = userSnap.exists ? userSnap.data() : null;
    const limit = effectiveTripLimit(user);
    const countSnap = await db
      .collection('trips')
      .where('ownerUid', '==', req.uid)
      .count()
      .get();
    if (countSnap.data().count >= limit) {
      const isPro = user && user.plan === 'pro';
      return res.status(402).json({
        error: isPro
          ? `Pro plan is capped at ${limit} trip${limit === 1 ? '' : 's'}. Contact support to raise the cap.`
          : `Free plan is capped at ${limit} trip${limit === 1 ? '' : 's'}. Upgrade to Pro to clone more templates.`,
        code: 'TRIP_LIMIT_REACHED',
        limit,
      });
    }

    // Deep-copy the trip into the requester's account. Stops are
    // primitive-only, so JSON round-trip is enough. Pins live in a
    // subcollection — we copy them after the parent is created.
    const cloneData = {
      ownerUid: req.uid,
      name: source.name ? `${source.name} (copy)` : 'Untitled trip',
      description: source.description || '',
      coverEmoji: source.coverEmoji || '🚗',
      startDate: null, // clones reset the start date — the new owner picks one
      maxKmPerDay: typeof source.maxKmPerDay === 'number' ? source.maxKmPerDay : 600,
      stops: Array.isArray(source.stops) ? JSON.parse(JSON.stringify(source.stops)) : [],
      totalKm: source.totalKm || 0,
      totalDays: source.totalDays || 0,
      countries: Array.isArray(source.countries) ? [...source.countries] : [],
      collaborators: [],
      shareToken: null,
      isShared: false,
      isTemplate: false, // the clone is a private editable copy
      // Fuel preferences travel with the clone since they describe the
      // *traveller's* car. They can edit if they want.
      fuelConsumption: source.fuelConsumption || null,
      fuelUnit: source.fuelUnit || null,
      fuelPrice: source.fuelPrice || null,
      fuelCurrency: source.fuelCurrency || null,
      fuelOverrides: Array.isArray(source.fuelOverrides)
        ? JSON.parse(JSON.stringify(source.fuelOverrides))
        : [],
      clonedFrom: req.params.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Strip null/undefined fuel fields — keeps the doc shape consistent
    // with create flow which only sets them when explicitly provided.
    for (const k of ['fuelConsumption', 'fuelUnit', 'fuelPrice', 'fuelCurrency']) {
      if (cloneData[k] == null) delete cloneData[k];
    }

    const cloneRef = await db.collection('trips').add(cloneData);

    // Copy pins subcollection.
    const pinsSnap = await sourceRef.collection('pins').get();
    if (!pinsSnap.empty) {
      const batch = db.batch();
      pinsSnap.forEach((p) => {
        const data = p.data();
        const target = cloneRef.collection('pins').doc();
        batch.set(target, {
          ...data,
          addedByUid: req.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }

    // Bump source cloneCount. Single increment, eventually consistent
    // with the create above — fine for a counter.
    await sourceRef.update({
      cloneCount: admin.firestore.FieldValue.increment(1),
    });

    const out = await cloneRef.get();
    res.status(201).json({ id: cloneRef.id, ...out.data() });
  } catch (e) {
    console.error('POST /api/templates/:id/clone failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
