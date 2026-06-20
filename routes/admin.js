const express = require('express');
const { admin, getDb } = require('../lib/firebase');
const { authRequired } = require('../middleware/auth');
const { adminRequired } = require('../middleware/admin');

const router = express.Router();
router.use('/api/admin', authRequired, adminRequired);

const PAGE_SIZE = 50;

router.get('/api/admin/stats', async (req, res) => {
  try {
    const db = getDb();
    const [tripsSnap, usersSnap, templatesSnap, favoritesSnap, proUsersSnap] = await Promise.all([
      db.collection('trips').count().get(),
      db.collection('users').count().get(),
      db.collection('trips').where('isTemplate', '==', true).count().get(),
      db.collection('favorites').count().get(),
      db.collection('users').where('plan', '==', 'pro').count().get(),
    ]);
    const totalUsers = usersSnap.data().count;
    const proUsers = proUsersSnap.data().count;
    res.json({
      trips: tripsSnap.data().count,
      users: totalUsers,
      templates: templatesSnap.data().count,
      favorites: favoritesSnap.data().count,
      proUsers,
      freeUsers: totalUsers - proUsers,
    });
  } catch (e) {
    console.error('GET /api/admin/stats failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.get('/api/admin/users', async (req, res) => {
  try {
    const db = getDb();
    const planFilter = req.query.planFilter || 'all';
    const cursor = req.query.cursor || null;

    let q = db.collection('users').orderBy('email').limit(PAGE_SIZE + 1);
    if (planFilter === 'pro' || planFilter === 'free') {
      q = db.collection('users')
        .where('plan', '==', planFilter)
        .orderBy('email')
        .limit(PAGE_SIZE + 1);
    }
    if (cursor) {
      q = q.startAfter(cursor);
    }
    const snap = await q.get();
    const all = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    const hasMore = all.length > PAGE_SIZE;
    const users = hasMore ? all.slice(0, PAGE_SIZE) : all;
    const nextCursor = hasMore ? users[users.length - 1].email : null;
    res.json({ users, nextCursor });
  } catch (e) {
    console.error('GET /api/admin/users failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.get('/api/admin/users/:uid', async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('users').doc(req.params.uid).get();
    if (!snap.exists) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    res.json({ uid: snap.id, ...snap.data() });
  } catch (e) {
    console.error('GET /api/admin/users/:uid failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.put('/api/admin/users/:uid/plan', async (req, res) => {
  try {
    const body = req.body || {};
    if (body.plan !== 'free' && body.plan !== 'pro') {
      return res.status(400).json({ error: 'plan must be free or pro', code: 'INVALID' });
    }
    const update = {
      plan: body.plan,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (body.tripLimit != null) {
      if (typeof body.tripLimit !== 'number' || body.tripLimit < 0) {
        return res.status(400).json({ error: 'tripLimit must be a non-negative number', code: 'INVALID' });
      }
      update.tripLimit = body.tripLimit;
    }
    const db = getDb();
    await db.collection('users').doc(req.params.uid).set(update, { merge: true });
    const snap = await db.collection('users').doc(req.params.uid).get();
    res.json({ uid: snap.id, ...snap.data() });
  } catch (e) {
    console.error('PUT /api/admin/users/:uid/plan failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.get('/api/admin/trips', async (req, res) => {
  try {
    const db = getDb();
    const cursor = req.query.cursor || null;
    let q = db.collection('trips').orderBy('createdAt', 'desc').limit(PAGE_SIZE + 1);
    if (cursor) {
      q = q.startAfter(new admin.firestore.Timestamp(parseInt(cursor, 10), 0));
    }
    const snap = await q.get();
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const hasMore = all.length > PAGE_SIZE;
    const trips = hasMore ? all.slice(0, PAGE_SIZE) : all;
    const last = trips[trips.length - 1];
    const nextCursor = hasMore && last?.createdAt?.seconds ? String(last.createdAt.seconds) : null;
    res.json({ trips, nextCursor });
  } catch (e) {
    console.error('GET /api/admin/trips failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.delete('/api/admin/trips/:id', async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    const pinsSnap = await ref.collection('pins').get();
    const batch = db.batch();
    pinsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/admin/trips/:id failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
