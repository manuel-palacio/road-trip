function adminRequired(req, res, next) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const userEmail = (req.userEmail || '').toLowerCase();
  if (!adminEmail || userEmail !== adminEmail) {
    return res.status(403).json({ error: 'Not admin', code: 'NOT_ADMIN' });
  }
  next();
}

module.exports = { adminRequired };
