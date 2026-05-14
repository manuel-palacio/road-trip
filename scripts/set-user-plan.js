#!/usr/bin/env node
// Flip a user's plan in Firestore. Useful until Paddle (Slice 12) ships
// a self-serve upgrade flow.
//
// Usage:
//   node scripts/set-user-plan.js <email> <plan>
//
// Examples:
//   node scripts/set-user-plan.js emanuel.palacio@gmail.com pro
//   node scripts/set-user-plan.js friend@example.com free
//
// Reads GOOGLE_APPLICATION_CREDENTIALS + FIREBASE_PROJECT_ID + FIRESTORE_DATABASE_ID
// from .env, same as the server.
require('dotenv').config();
const { getAuth, getDb } = require('../lib/firebase');

async function main() {
  const [email, plan] = process.argv.slice(2);
  if (!email || !plan) {
    console.error('Usage: node scripts/set-user-plan.js <email> <plan>');
    console.error('  <plan> must be "free" or "pro"');
    process.exit(1);
  }
  if (plan !== 'free' && plan !== 'pro') {
    console.error(`Invalid plan "${plan}" — must be "free" or "pro".`);
    process.exit(1);
  }
  const user = await getAuth().getUserByEmail(email);
  await getDb()
    .collection('users')
    .doc(user.uid)
    .set({ plan, updatedAt: new Date().toISOString() }, { merge: true });
  console.log(`✓ ${email} (uid ${user.uid}) → plan = ${plan}`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
