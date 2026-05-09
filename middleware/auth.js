const { getAuth } = require('../lib/firebase');

function getAllowedEmails() {
  const raw = process.env.ALLOWED_EMAILS;
  if (!raw || !raw.trim()) return null;
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res
      .status(401)
      .json({ error: 'Missing or invalid Authorization header', code: 'UNAUTHENTICATED' });
  }

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(match[1]);
  } catch (e) {
    return res
      .status(401)
      .json({ error: 'Invalid or expired token', code: 'UNAUTHENTICATED' });
  }

  const email = (decoded.email || '').toLowerCase();
  const allowed = getAllowedEmails();
  if (allowed && !allowed.includes(email)) {
    return res.status(403).json({ error: 'Access denied', code: 'ACCESS_DENIED' });
  }

  req.uid = decoded.uid;
  req.userEmail = email;
  req.userName = decoded.name || '';
  req.userPicture = decoded.picture || '';
  next();
}

module.exports = { authRequired };
