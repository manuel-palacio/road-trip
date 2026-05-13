# Road Trip Map Builder

Build your road trip. Share the adventure.

A small SaaS for planning multi-day driving trips: drop stops on a map, watch days arrange themselves under a daily-kilometre budget, drop pins for hotels / restaurants / scenic stops, share read-only links, export PDF + GPX. Vite + React + TypeScript on the front end, Express on Cloud Run for the API, Firebase Auth for sign-in, Firestore for storage.

---

## Local development

You can do everything locally against the same Firebase project that's deployed to Cloud Run — there's no separate dev environment. Trip data you create on `localhost` goes into the same Firestore as production, so it's live for whichever account you log in with.

### Prerequisites

- **Node.js ≥ 20** (`node --version`) — see `package.json` `engines`.
- **npm** — comes with Node.
- A Firebase project + Maps API key. If you haven't set one up yet, walk through [First-time setup](#first-time-setup--fresh-gcp-project-to-running-deploy) below first.

### First run

```bash
git clone https://github.com/manuel-palacio/road-trip.git
cd road-trip
npm install
cp .env.example .env
```

Fill in `.env`. The four values that **must** be set for the app to start locally are:

| Var | Source |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase console → Project Settings → "Project ID" |
| `FIREBASE_CLIENT_CONFIG` | Firebase console → Project Settings → Your apps → Web app → "SDK setup and configuration" → "Config". Paste the whole JSON object on one line. |
| `GOOGLE_MAPS_API_KEY` | GCP Console → Credentials. Make sure `http://localhost:8080` and `http://localhost:5173` are in the HTTP-referrer allowlist of the key. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to a Firebase Admin service account JSON file (see below). |

To get the service account JSON:

1. GCP Console → IAM & Admin → Service Accounts.
2. Find or create a service account with the `Firebase Admin SDK Administrator Service Agent` role.
3. Keys tab → Add Key → Create new key → JSON. Download.
4. Save it somewhere outside the repo (it's secret) and put the absolute path in `GOOGLE_APPLICATION_CREDENTIALS`.

`ALLOWED_EMAILS` should include your own Google account email or login will be refused. `ADMIN_EMAIL` controls the visibility of admin links (server still re-verifies on every admin route).

### Run it

```bash
npm run dev
```

This runs two processes in parallel via `concurrently`:

- **server** (`nodemon server.js`) — Express on `:8080`, restarts on backend file changes.
- **client** (`vite`) — Vite dev server on `:5173` with HMR.

Open **http://localhost:5173** for the React client with hot reload. The Vite server proxies `/api/*`, `/config`, `/health`, and `/actuator` to the Express server on `:8080` — so the frontend talks to a real backend the same way it does in production.

You can also hit the Express server directly on `:8080` (it serves the production-built `dist/` if you've run `npm run build`, otherwise nothing useful for the SPA).

Quick health checks:

- App: http://localhost:5173
- Health: http://localhost:8080/health
- Public config: http://localhost:8080/config

### Common tasks

| Command | Does |
|---|---|
| `npm run dev` | Start server + client in dev mode with hot reload (default). |
| `npm run dev:server` | Server only (`nodemon`). Useful when iterating on `routes/*.js`. |
| `npm run dev:client` | Vite client only — assumes `:8080` is already running. |
| `npm test` | Run the Vitest suite (frontend unit tests). |
| `npm run build` | Production build into `dist/`. Generates the SW + PWA manifest too. |
| `npm start` | Run the production server (`node server.js`) — used by Cloud Run. |

### Troubleshooting

- **`Error: Firebase Admin not initialized`** on the server → `GOOGLE_APPLICATION_CREDENTIALS` is unset or points to a missing file. Verify the path is absolute and readable.
- **Login redirect spins forever** → your Google account isn't in `ALLOWED_EMAILS`, or `FIREBASE_CLIENT_CONFIG` is malformed (must be a single-line JSON object). Check the browser console.
- **Map doesn't load**, console says `referer not allowed` → add `http://localhost:5173` (and `:8080`) to the Maps API key's HTTP-referrer allowlist in GCP Console.
- **CORS / 404 on `/api/...`** → you're hitting `:5173` directly without the Vite dev server, OR you ran `vite` instead of `npm run dev`. The proxy only works through `npm run dev:client` / `npm run dev`.
- **Service worker caching stale code in dev** → SW is disabled in dev (`devOptions.enabled: false` in `vite.config.ts`). If you previously visited a production build at `localhost:5173`, unregister any leftover SW: DevTools → Application → Service Workers → Unregister.
- **Want to test the PWA / offline behavior locally** → run `npm run build && npx vite preview` and hit the previewed URL. The SW only registers in production builds.

---

## First-time setup — fresh GCP project to running deploy

If you're standing the project up from scratch, work through these in order. Each step lists what to create and which env var or file ends up depending on it.

### 1. Create the GCP project

```bash
gcloud projects create road-trip-NNNN --name="Road Trip"
gcloud config set project road-trip-NNNN
gcloud beta billing projects link road-trip-NNNN --billing-account=XXXXXX-XXXXXX-XXXXXX
```

(You can also do this in the [GCP Console](https://console.cloud.google.com/projectcreate). Billing must be enabled — Cloud Run, Firestore, and Maps all need it. The free tier is generous; expect <$1/month for low traffic.)

Note your **project ID** — you'll reference it as `FIREBASE_PROJECT_ID` later.

### 2. Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com \
  maps-backend.googleapis.com \
  routes.googleapis.com \
  places-backend.googleapis.com \
  secretmanager.googleapis.com
```

| API | Why |
|---|---|
| run | Hosting for the Express server |
| cloudbuild | Build pipeline (auto-deploys on push to main) |
| artifactregistry | Stores built container images |
| firestore | Trip + pin storage |
| identitytoolkit | Firebase Auth |
| maps-backend | Google Maps JS SDK + Places + Directions |
| routes | New Routes API (driving directions; replaces the deprecated DirectionsService) |
| places-backend | Place Autocomplete + Place Details |
| secretmanager | Optional — store Paddle / service-account secrets |

### 3. Set up Firebase

Connect Firebase to the same GCP project:

1. Go to the [Firebase Console](https://console.firebase.google.com/) → **Add project** → pick the existing GCP project.
2. **Authentication** → **Get started** → enable the **Google** sign-in provider.
3. **Authentication** → **Settings** → **Authorized domains** → add `localhost` (for dev) and the eventual Cloud Run URL.
4. **Project Settings** → **General** → scroll to **Your apps** → **Add app** → **Web** → name it (icon optional). Copy the `firebaseConfig` object — you'll paste it as `FIREBASE_CLIENT_CONFIG` (as a JSON string).

### 4. Create the Firestore database

```bash
gcloud firestore databases create \
  --database=road-trip-db \
  --location=eur3 \
  --type=firestore-native
```

(Pick a location close to your users. `eur3` = Europe multi-region. The non-default database name `road-trip-db` is what `FIRESTORE_DATABASE_ID` references — set it to `(default)` if you used the default database instead.)

### 5. Deploy the security rules

The repo includes `firestore.rules` (deny-by-default with explicit owner / collaborator carve-outs). Deploy it once, then re-deploy after any rule change:

```bash
npm install -g firebase-tools          # one-time
firebase login
firebase use --add                     # pick the project
firebase deploy --only firestore:rules --project road-trip-NNNN
```

If your Firestore database isn't named `(default)`, edit `firebase.json` to point to the right database before deploying — the rules are per-database.

Verify in the Firebase Console → Firestore → Rules that the rules show up. Try an unauthenticated read in the **Rules Playground** — should be denied.

### 6. Get a Maps JS API key

In the [Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials):

1. **Create credentials** → **API key**.
2. Edit the key, set **Application restrictions** = **HTTP referrers** and add:
   - `http://localhost:8080/*` (for local dev)
   - `http://localhost:5173/*`
   - `https://your-cloud-run-domain.run.app/*` (after step 11)
   - Any custom domain you'll use later
3. Set **API restrictions** = **Restrict key** → enable: Maps JavaScript API, Places API, Routes API.
4. Save the key as `GOOGLE_MAPS_API_KEY`.

### 7. Service account for Firebase Admin (local dev only)

For Cloud Run, the runtime service account is used automatically — skip this step. For **local development**, you need to point the Firebase Admin SDK at credentials:

1. Firebase Console → **Project Settings** → **Service accounts** → **Generate new private key**.
2. Save the JSON outside the repo (e.g. `~/.gcp/road-trip-sa.json`). It is `.gitignore`'d but treat it like a password.
3. In `.env`, set `GOOGLE_APPLICATION_CREDENTIALS=/Users/you/.gcp/road-trip-sa.json`.

### 8. IAM for Cloud Run

The Cloud Run runtime service account needs permission to read/write Firestore and call the Identity Platform admin API. By default the Compute Engine default service account has this, but if you create a dedicated service account, grant it:

```bash
PROJECT_ID=road-trip-NNNN
SA="${PROJECT_ID}@appspot.gserviceaccount.com"   # or your custom SA

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA}" --role="roles/datastore.user"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA}" --role="roles/firebaseauth.admin"
```

### 9. Paddle (optional — payments not yet implemented)

When you're ready for Slice 12, sign up at [paddle.com](https://www.paddle.com), use the Sandbox environment to start, create a Product + Price, and grab three credentials:
- **API key** → set as `PADDLE_API_KEY` (server only, store in Secret Manager)
- **Client-side token** → set as `PADDLE_CLIENT_TOKEN` (exposed via /config)
- **Webhook secret** → set as `PADDLE_WEBHOOK_SECRET` (server only)

Set the webhook URL in Paddle to `https://<your-cloud-run-url>/api/paddle/webhook` once Slice 12 ships.

### 10. (Optional) Secret Manager for sensitive values

For production, don't put secrets in Cloud Run env vars directly. Use Secret Manager:

```bash
echo -n "your-secret-here" | gcloud secrets create paddle-api-key --data-file=-
gcloud run services update road-trip --region=europe-north1 \
  --update-secrets PADDLE_API_KEY=paddle-api-key:latest
```

### 11. Artifact Registry — built container store

Cloud Build auto-creates this on first deploy if you use the default trigger, but you can pre-create it:

```bash
gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker \
  --location=europe-north1
```

### 12. Cloud Build trigger — auto-deploy on push

In the [Cloud Build → Triggers](https://console.cloud.google.com/cloud-build/triggers) console:

1. **Connect repository** → GitHub → authorize → pick this repo.
2. **Create trigger**:
   - Event: **Push to a branch**
   - Branch: `^main$`
   - Configuration: **Cloud Build configuration file** → `cloudbuild.yaml` (in repo root)
   - Service account: the same one Cloud Run uses
3. **Run trigger** once manually to do the first deploy. Subsequent deploys happen on every push to `main`.

After the first build finishes, find the Cloud Run service URL with:

```bash
gcloud run services describe road-trip --region=europe-north1 --format='value(status.url)'
```

Open it. You should see the Login screen.

---

## Environment variables reference

All of these come from `.env` locally and from Cloud Run env vars (or Secret Manager) in production. See `.env.example` for a template.

| Var | Where set | Notes |
|---|---|---|
| `FIREBASE_PROJECT_ID` | local + prod | Your GCP project ID |
| `FIRESTORE_DATABASE_ID` | local + prod | `(default)` or a custom database name like `road-trip-db` |
| `FIREBASE_CLIENT_CONFIG` | local + prod | JSON-stringified Firebase web config (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, measurementId) |
| `GOOGLE_APPLICATION_CREDENTIALS` | local only | Absolute path to your service-account JSON. Leave unset on Cloud Run (ADC handles it) |
| `GOOGLE_MAPS_API_KEY` | local + prod | Your Maps JS API key (referrer-restricted) |
| `ADMIN_EMAIL` | local + prod | Owner email — controls admin-link visibility (server still re-checks) |
| `ALLOWED_EMAILS` | local + prod | Comma-separated allowlist for sign-in. Leave blank to allow any Google account |
| `FREE_TRIP_LIMIT` | local + prod | Cap on free-tier trips per user. Default `2` |
| `PRO_TRIP_LIMIT` | local + prod | Cap on pro-tier trips. Default `10`. Set very high or use `Number.MAX_SAFE_INTEGER` to mean "unlimited" |

---

## Operational tasks

### Add an email to the access allowlist

```bash
gcloud run services update road-trip --region=europe-north1 \
  --update-env-vars ALLOWED_EMAILS=emanuel.palacio@gmail.com,friend@example.com
```

The friend has to sign in with the **exact** Google account email — `@gmail.com` and `@googlemail.com` aliases don't match.

### Promote a user to Pro

Until Paddle ships (Slice 12), promote users by hand in Firestore:

```
collection: users
document:   <their-uid>
field:      plan = "pro"
```

You can find the UID via Firebase Console → Authentication → Users.

### Verify the latest deploy

```bash
gcloud builds list --limit=1 --format='value(status,substitutions.COMMIT_SHA)'
gcloud run services describe road-trip --region=europe-north1 \
  --format='value(status.latestReadyRevisionName,spec.template.spec.containers[0].image)'
```

The image tag includes the full commit SHA — easy way to confirm which commit is live without trusting "latest" pointers.

### Re-deploy Firestore rules

```bash
firebase deploy --only firestore:rules --project <project-id>
```

### Rotate the Maps API key

If a key leaks, restrict the old one immediately and create a new one (step 6). Update `GOOGLE_MAPS_API_KEY` on Cloud Run; the new revision will be live within ~30 seconds.

---

## Architecture sketch

```
┌────────────┐    HTTPS     ┌────────────────────┐
│   Browser  │  ──────────▶ │  Cloud Run         │
│  (React +  │              │  (Express + Vite   │
│   Vite SSR │              │   built bundle)    │
│   bundle)  │              │                    │
└────────────┘              │  /api/* routes     │
      │                     │  /config (public)  │
      │ Firebase Auth       │  /api/share/* (no  │
      │ (popup)             │     auth)          │
      ▼                     │                    │
┌────────────┐              │  Firebase Admin    │
│  Firebase  │              │  SDK (bypasses     │
│  Auth      │              │  Firestore rules)  │
└────────────┘              └─────────┬──────────┘
                                      │
                                      ▼
                            ┌────────────────────┐
                            │   Firestore        │
                            │   road-trip-db     │
                            │   trips/           │
                            │   trips/{id}/pins/ │
                            │   users/           │
                            └────────────────────┘
```

The browser only talks to `/api/*` (authenticated via Firebase ID tokens) and `/config` / `/api/share/*` (public). It never touches Firestore directly — Firestore rules deny client access by default as defense-in-depth.

---

## Tests

```bash
npm test          # vitest, ~65 tests covering compute logic + place mapping + flags
npm run build     # production bundle
```

There is no integration / E2E suite yet. See [#48](https://github.com/manuel-palacio/road-trip/issues/48) for the deferred Marker migration and the broader testing strategy.

---

## Slices shipped

The product was built incrementally as numbered "Slices". Highlights:

- **01–07** — Auth, dashboard, builder with Places autocomplete, day computation, AA badge, drag-to-reorder, force-day-start, highlights
- **08** — Read-only Viewer screen
- **09** — Custom pins (subcollection) with drop-mode + POI clicks
- **10** — Share links (public read-only screen with sanitized response)
- **11** — Free tier hard cap (402 + Dashboard banner)
- **13** — PDF + GPX export
- **16** — Mobile responsive + Firestore rules + this README

Open issues track what's next.
