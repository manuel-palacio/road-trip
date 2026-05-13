// Effective trip-count limit for a user. Resolution order:
//   1. user.tripLimit (Firestore field) — admin override per user
//   2. PRO_TRIP_LIMIT env var if user.plan === 'pro' (default 10)
//   3. FREE_TRIP_LIMIT env var otherwise (default 1)
//
// Both env vars are integers. The helper is the single source of truth
// for create/clone checks and the /api/me response.
function effectiveTripLimit(user) {
  if (user && typeof user.tripLimit === 'number' && user.tripLimit > 0) {
    return user.tripLimit;
  }
  const plan = user && user.plan === 'pro' ? 'pro' : 'free';
  return plan === 'pro'
    ? parseInt(process.env.PRO_TRIP_LIMIT || '10', 10)
    : parseInt(process.env.FREE_TRIP_LIMIT || '1', 10);
}

module.exports = { effectiveTripLimit };
