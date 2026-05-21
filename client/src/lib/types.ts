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
  bookingAffiliateId?: string;
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
  type: 'start' | 'overnight' | 'waypoint' | 'destination' | 'fuel';
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

// Per-country fuel override. Consumption stays trip-wide (the car has one
// mileage), but price + currency can differ per country crossed.
export type FuelOverride = {
  countryCode: string;       // ISO 3166-1 alpha-2, uppercase
  price: number;             // per litre if L/100km, per gallon if MPG
  currency: string;          // 3-letter ISO code
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
  // Fuel cost estimator — all four optional. When consumption + price are
  // both set, the UI displays an estimated cost per day and per trip.
  fuelConsumption?: number;
  fuelUnit?: FuelUnit;
  fuelPrice?: number;        // default per-litre/gallon price
  fuelCurrency?: string;     // 3-letter ISO code, e.g. 'EUR', 'USD'
  fuelOverrides?: FuelOverride[];
  // Approximate distance the car can cover on a full tank. Used by the
  // fuel-stop suggester (findFuelSearchTarget) and the per-day "long leg"
  // warning chip. Defaults to 500 km when unset.
  tankRangeKm?: number;
  // Community templates — when isTemplate=true the trip is visible at
  // /api/templates (public, no auth) and clonable by anyone. The owner
  // controls publishing; cloneCount is server-incremented on each clone.
  isTemplate?: boolean;
  templateDescription?: string;
  templateTags?: string[];
  cloneCount?: number;
  publishedAt?: unknown;
  // Schema-version stamp. v2 normalized stray 'overnight' types; v3
  // promotes legacy fuel waypoints (type='waypoint' + category='fuel')
  // to the first-class type='fuel'. Each migration runs at most once
  // per trip — on first load, then the next save bumps the stamp.
  dataVersion?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

// Public-facing template card data. The /api/templates endpoint returns a
// curated subset that's safe to expose without auth — no ownerUid,
// shareToken, or collaborators, plus owner display name + photo for credit.
export type TemplateCard = {
  id: string;
  name: string;
  coverEmoji?: string;
  templateDescription?: string;
  templateTags?: string[];
  totalKm?: number;
  totalDays?: number;
  countries?: string[];
  cloneCount?: number;
  owner: { displayName: string; photoURL: string };
  publishedAt?: unknown;
};
