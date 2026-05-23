import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import type { FirebaseClientConfig } from './types';

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
const provider = new GoogleAuthProvider();

export function initFirebase(cfg: FirebaseClientConfig) {
  if (firebaseApp) return firebaseAuth!;
  firebaseApp = initializeApp(cfg);
  firebaseAuth = getAuth(firebaseApp);
  return firebaseAuth;
}

export function getFirebaseAuth(): Auth {
  if (!firebaseAuth) throw new Error('Firebase not initialized');
  return firebaseAuth;
}

export async function signInWithGoogle() {
  return signInWithPopup(getFirebaseAuth(), provider);
}

/** Dev-only impersonation flow: fetch a Firebase custom token from the
 * server's loopback-gated /api/dev/auth/impersonate endpoint, then sign
 * in with it. The resulting Firebase user is the real account whose UID
 * the server was configured to mint for (DEV_IMPERSONATE_UID in .env).
 * From here on the app is indistinguishable from a Google-sign-in flow. */
export async function signInAsDev() {
  const res = await fetch('/api/dev/auth/impersonate', { method: 'POST' });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? 'Dev sign-in unavailable (server not configured for dev impersonation)'
        : `Dev sign-in failed (${res.status})`,
    );
  }
  const { token } = (await res.json()) as { token: string };
  return signInWithCustomToken(getFirebaseAuth(), token);
}

export async function signOutFirebase() {
  return signOut(getFirebaseAuth());
}

export function listenAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), cb);
}

export type { User };
