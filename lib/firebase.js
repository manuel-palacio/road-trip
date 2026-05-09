const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

let initialized = false;

function init() {
  if (initialized) return;
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || undefined,
  });
  initialized = true;
}

function getAuth() {
  init();
  return admin.auth();
}

function getDb() {
  init();
  const dbId = process.env.FIRESTORE_DATABASE_ID || '(default)';
  return getFirestore(admin.app(), dbId);
}

module.exports = { admin, getAuth, getDb };
