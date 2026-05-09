const express = require('express');
const { admin, getDb } = require('../lib/firebase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/api/me', authRequired, async (req, res) => {
  try {
    const db = getDb();
    const userRef = db.collection('users').doc(req.uid);
    const snap = await userRef.get();

    let user;
    if (!snap.exists) {
      const tripLimit = parseInt(process.env.FREE_TRIP_LIMIT || '2', 10);
      await userRef.set({
        email: req.userEmail,
        displayName: req.userName,
        photoURL: req.userPicture,
        plan: 'free',
        tripLimit,
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
      tripCount: tripsSnap.data().count,
    });
  } catch (e) {
    console.error('GET /api/me failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
