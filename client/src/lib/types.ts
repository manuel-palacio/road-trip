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
  mapId: string;
  adminEmail: string;
  bookingAffiliateId?: string;
  getYourGuidePartnerId?: string;
  viatorPartnerId?: string;
};

export type MeResponse = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  plan: 'free' | 'pro';
  tripLimit: number;
  tripCount: number;
  homeCurrency?: string;
  createdAt?: unknown;
};

export type Stop = {
  id: string;
  /** Full place name from search/geocoding. Preserved for detail panels,
   * info windows, and deep links (e.g. Google Maps). For fuel stops this is
   * the Places API station name like "Circle K Grenoble Autoroute A48". */
  name: string;
  /** Short display label shown in map markers, stop list, and chips. For
   * fuel stops this is the locality (city) name when reverse geocoding
   * resolves one, falling back to "Fuel stop". For user-added stops it
   * defaults to the same value as `name` unless the user overrode it. */
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
  /** Polyline path for the leg arriving at this stop, persisted on save so
   * viewers don't re-call the Routes API just to re-draw the line. Hydrated
   * back into the in-memory route cache by useRouteSegments at load time.
   * First stop in a trip has no inbound leg and omits this. */
  routePath?: { lat: number; lng: number }[];
  /** True when the Routes API failed for this leg in the last fetch — used
   * by the builder to flag the row visually. Not persisted across saves. */
  routingFailed?: boolean;
  /** True when the auto-fuel engine inserted this stop. Cleared whenever the
   * user mutates the stop (rename, reorder, type change, highlight edit).
   * Once cleared, the engine treats the stop as user-owned and never removes
   * it. Only ever set on type='fuel' stops. */
  addedByAuto?: boolean;
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

export type BudgetCategory = 'fuel' | 'hotel' | 'food' | 'tolls' | 'activities' | 'other';

export type BudgetItem = {
  id: string;
  stopId?: string | null;
  dayNumber?: number | null;
  category: BudgetCategory;
  label: string;
  amount: number;
  currency: string;   // ISO 4217 uppercase
  isPaid?: boolean;
  addedByUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type FxRates = {
  base: string;       // e.g. 'EUR'
  date: string;       // ISO YYYY-MM-DD
  rates: Record<string, number>;
};

export type Favorite = {
  id: string;
  ownerUid: string;
  placeId?: string;
  name: string;
  label: string;
  lat: number;
  lng: number;
  countryCode?: string;
  category?: PinCategory;
  sourceTripId?: string;
  sourceTripName?: string;
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
  // `null` is an explicit clear: it survives JSON round-trips (undefined
  // doesn't), which is how the client tells the server to blank a field.
  fuelConsumption?: number | null;
  fuelUnit?: FuelUnit;
  fuelPrice?: number | null; // default per-litre/gallon price
  fuelCurrency?: string;     // 3-letter ISO code, e.g. 'EUR', 'USD'
  fuelOverrides?: FuelOverride[] | null;
  // Approximate distance the car can cover on a full tank. Used by the
  // fuel-stop suggester (findFuelSearchTarget) and the per-day "long leg"
  // warning chip. Defaults to 500 km when unset.
  tankRangeKm?: number | null;
  // Tank capacity in **litres** (canonical). MPG users see + edit this as
  // gallons in the UI but it's converted to litres for storage. Drives the
  // "approx. N fill-ups" trip-summary annotation. Optional; no fill-up
  // estimate when unset.
  tankSizeLitres?: number | null;
  /** Per-trip toggle for the auto-fuel engine. When true (or undefined for
   * existing trips), the engine reactively inserts fuel stops where the tank
   * would run low. Default-on retroactively applies to trips that pre-date
   * this field. */
  autoFuel?: boolean;
  // Community templates — when isTemplate=true the trip is visible at
  // /api/templates (public, no auth) and clonable by anyone. The owner
  // controls publishing; cloneCount is server-incremented on each clone.
  isTemplate?: boolean;
  templateDescription?: string;
  templateTags?: string[];
  /** Template visibility. 'public' (default, shown in the marketplace) or
   * 'unlisted' (accessible by direct link only — for travel agents, content
   * creators sharing bespoke itineraries privately). Only meaningful when
   * isTemplate === true. */
  templateVisibility?: 'public' | 'unlisted';
  cloneCount?: number;
  publishedAt?: unknown;
  /** Admin-only: marks a template as sponsored (paid placement). Sorts to the
   * top of the template gallery (max 2 per page) above organic results. */
  sponsored?: boolean;
  sponsorLabel?: string;
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
  sponsored?: boolean;
  sponsorLabel?: string;
  owner: { displayName: string; photoURL: string };
  publishedAt?: unknown;
};
