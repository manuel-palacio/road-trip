const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

function makeLimiter({ windowMs, max, label }) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => req.uid || ipKeyGenerator(req.ip),
    skip: (req) => ADMIN_EMAIL && (req.userEmail || '').toLowerCase() === ADMIN_EMAIL,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const retryAfterSec = Math.ceil(windowMs / 1000);
      res.set('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: `Too many requests (${label}). Please slow down.`,
        code: 'RATE_LIMITED',
        retryAfterSec,
      });
    },
  });
}

module.exports = {
  tripCreate: makeLimiter({ windowMs: 60 * 60 * 1000, max: 10, label: 'trip-create' }),
  tripUpdate: makeLimiter({ windowMs: 60 * 1000, max: 60, label: 'trip-update' }),
  pinCreate: makeLimiter({ windowMs: 60 * 1000, max: 60, label: 'pin-create' }),
  budgetCreate: makeLimiter({ windowMs: 60 * 1000, max: 60, label: 'budget-create' }),
  favoriteCreate: makeLimiter({ windowMs: 60 * 1000, max: 30, label: 'favorite-create' }),
  collaboratorAdd: makeLimiter({ windowMs: 60 * 60 * 1000, max: 20, label: 'collaborator-add' }),
  pdfExport: makeLimiter({ windowMs: 60 * 1000, max: 5, label: 'pdf-export' }),
  publicShare: makeLimiter({ windowMs: 60 * 1000, max: 30, label: 'public-share' }),
  templateClone: makeLimiter({ windowMs: 60 * 1000, max: 10, label: 'template-clone' }),
};
