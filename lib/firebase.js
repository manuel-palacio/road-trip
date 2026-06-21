const { initializeApp, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

let initialized = false;

function init() {
  if (initialized) return;
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || undefined,
  });
  initialized = true;
}

function auth() {
  init();
  return getAuth(getApp());
}

function getDb() {
  init();
  const dbId = process.env.FIRESTORE_DATABASE_ID || '(default)';
  return getFirestore(getApp(), dbId);
}

function app() {
  init();
  return getApp();
}

// firebase-admin v14 removed the legacy namespaced API (admin.auth(),
// admin.firestore.FieldValue, ...). This shim preserves that shape so the
// route handlers that import `admin` keep working against the modular SDK.
const admin = {
  auth,
  app,
  firestore: { FieldValue, Timestamp },
};

module.exports = { admin, getAuth: auth, getDb };
