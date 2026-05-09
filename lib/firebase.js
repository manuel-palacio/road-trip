const admin = require('firebase-admin');

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
  return admin.firestore();
}

module.exports = { admin, getAuth, getDb };
