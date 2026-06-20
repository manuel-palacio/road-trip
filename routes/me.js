const express = require('express');
const { admin, getDb } = require('../lib/firebase');
const { effectiveTripLimit } = require('../lib/limits');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/api/me', authRequired, async (req, res) => {
  try {
    const db = getDb();
    const userRef = db.collection('users').doc(req.uid);
    const snap = await userRef.get();

    let user;
    if (!snap.exists) {
      // Don't store tripLimit on the user doc — it's computed from
      // env + plan via effectiveTripLimit. Storing it freezes the limit
      // at signup-time and makes env changes invisible to existing users.
      await userRef.set({
        email: req.userEmail,
        displayName: req.userName,
        photoURL: req.userPicture,
        plan: 'free',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      user = (await userRef.get()).data();
    } else {
      user = snap.data();
    }

    const tripsSnap = await db
      .collection('trips')
      .where('ownerUid', '==', req.uid)
      .count()
      .get();

    res.json({
      uid: req.uid,
      ...user,
      tripLimit: effectiveTripLimit(user),
      tripCount: tripsSnap.data().count,
    });
  } catch (e) {
    console.error('GET /api/me failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.patch('/api/me', authRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const updates = {};
    if ('homeCurrency' in body) {
      if (typeof body.homeCurrency !== 'string' || !/^[A-Za-z]{3}$/.test(body.homeCurrency)) {
        return res.status(400).json({ error: 'homeCurrency must be 3 letters', code: 'INVALID' });
      }
      updates.homeCurrency = body.homeCurrency.toUpperCase();
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided', code: 'INVALID' });
    }
    const db = getDb();
    await db.collection('users').doc(req.uid).update({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/me failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
