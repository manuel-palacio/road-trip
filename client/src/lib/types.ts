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
  // Routing strategy for the leg from the previous stop. First stop in a
  // trip has no inbound leg and ignores this value.
  routeMode?: StopRouteMode;
  // Optional metadata carried over when this stop was promoted from a pin.
  // Lossless promote/demote keeps these around for Phase 3 unification.
  category?: PinCategory;
  priority?: PinPriority;
  notes?: string;
};

export type PinCategory = 'food' | 'hotel' | 'scenic' | 'fuel' | 'landmark' | 'other';
export type PinPriority = 'must' | 'want' | 'maybe';

// Routing strategy for the leg ARRIVING at a stop. Default 'fastest' if
// not set. 'scenic' avoids highways (regional roads); 'no-tolls' avoids
// toll roads; 'scenic-no-tolls' combines both.
export type StopRouteMode = 'fastest' | 'scenic' | 'no-tolls' | 'scenic-no-tolls';

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

export type FuelUnit = 'L/100km' | 'MPG';

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
  // Fuel cost estimator — all four optional. When consumption + price are
  // both set, the UI displays an estimated cost per day and per trip.
  fuelConsumption?: number;
  fuelUnit?: FuelUnit;
  fuelPrice?: number;        // per litre if L/100km, per gallon if MPG
  fuelCurrency?: string;     // 3-letter ISO code, e.g. 'EUR', 'USD'
  createdAt?: unknown;
  updatedAt?: unknown;
};
