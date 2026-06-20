const express = require('express');
const { getAuth } = require('../lib/firebase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.use('/api/users', authRequired);

// GET /api/users/lookup?email=foo@bar.com — resolves an email to a minimal
// public user profile. authRequired gates this behind the ALLOWED_EMAILS list;
// only signed-in users in the allowlist can resolve other users. Returns 404
// when the email is unknown. Does not echo the email back — only uid,
// displayName, and photoURL are returned.
router.get('/api/users/lookup', async (req, res) => {
  try {
    const email = (req.query.email || '').toString().trim().toLowerCase();
    if (!email || email.length > 254) {
      return res.status(400).json({ error: 'email required', code: 'INVALID' });
    }
    try {
      const u = await getAuth().getUserByEmail(email);
      return res.json({
        uid: u.uid,
        displayName: u.displayName || (u.email ? u.email.split('@')[0] : ''),
        photoURL: u.photoURL || '',
      });
    } catch {
      return res.status(404).json({ error: 'No such user', code: 'NOT_FOUND' });
    }
  } catch (e) {
    console.error('GET /api/users/lookup failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
