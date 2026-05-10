import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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

export async function signOutFirebase() {
  return signOut(getFirebaseAuth());
}

export function listenAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), cb);
}

export type { User };
