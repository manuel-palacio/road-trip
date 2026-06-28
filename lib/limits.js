// Effective trip-count limit for a user. Resolution order:
//   1. user.tripLimit (Firestore field) — admin override per user
//   2. PRO_TRIP_LIMIT env var if user.plan === 'pro' (default 10)
//   3. FREE_TRIP_LIMIT env var otherwise (default 2)
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
    : parseInt(process.env.FREE_TRIP_LIMIT || '2', 10);
}

// Effective daily Nearby Search cap for a user. Same resolution order as
// effectiveTripLimit: per-user Firestore override → plan env var → free env
// var. Backs the cooperative metering guardrail in routes/usage.js.
function effectiveNearbySearchDailyLimit(user) {
  if (user && typeof user.nearbySearchDailyLimit === 'number' && user.nearbySearchDailyLimit > 0) {
    return user.nearbySearchDailyLimit;
  }
  const plan = user && user.plan === 'pro' ? 'pro' : 'free';
  return plan === 'pro'
    ? parseInt(process.env.PRO_NEARBY_SEARCH_DAILY_LIMIT || '300', 10)
    : parseInt(process.env.FREE_NEARBY_SEARCH_DAILY_LIMIT || '150', 10);
}

module.exports = { effectiveTripLimit, effectiveNearbySearchDailyLimit };
