export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

export type AppConfig = {
  firebaseConfig: Partial<FirebaseClientConfig>;
  mapsApiKey: string;
  adminEmail: string;
};

export type MeResponse = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  plan: 'free' | 'pro';
  tripLimit: number;
  tripCount: number;
  createdAt?: unknown;
};

export type Stop = {
  id: string;
  name: string;
  label: string;
  lat: number;
  lng: number;
  countryCode?: string;
  type: 'start' | 'overnight' | 'waypoint' | 'destination';
  dayNumber?: number;
  forceDayStart?: boolean;
  highlights?: string[];
  kmFromPrevious?: number;
  durationFromPrevious?: string;
  durationSecondsFromPrevious?: number;
  // Optional metadata carried over when this stop was promoted from a pin.
  // Lossless promote/demote keeps these around for Phase 3 unification.
  category?: PinCategory;
  priority?: PinPriority;
  notes?: string;
};

export type PinCategory = 'food' | 'hotel' | 'scenic' | 'fuel' | 'landmark' | 'other';
export type PinPriority = 'must' | 'want' | 'maybe';

export type Pin = {
  id: string;
  name: string;
  category: PinCategory;
  priority?: PinPriority;
  notes?: string;
  lat: number;
  lng: number;
  addedByUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type Trip = {
  id: string;
  ownerUid: string;
  name: string;
  description?: string;
  coverEmoji?: string;
  startDate?: string | null;
  maxKmPerDay?: number;
  shareToken?: string | null;
  isShared?: boolean;
  collaborators?: string[];
  stops: Stop[];
  totalKm?: number;
  totalDays?: number;
  countries?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
};
