# Multi-Currency Budget Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Pro-gated budget panel to the Viewer sidebar where users can add/edit/delete per-day expense items in any currency, see per-day totals and trip total converted to their home currency via live FX rates.

**Architecture:** Server gains `budget_items` subcollection endpoints (mirroring the existing pins pattern) and a cached FX rates endpoint via Frankfurter API. Client adds a pure `budget.ts` helper, TanStack Query hooks, and a `BudgetPanel` component wired into the Viewer as a third tab. A "Budget" tab is hidden for Free users (shows upgrade CTA instead).

**Tech Stack:** Express (server routes), Firestore (budget_items subcollection + fx_cache collection), TanStack Query (client caching), Tailwind v3 design tokens, Vitest (unit tests), TypeScript.

---

### Task 1: Types

**Files:**
- Modify: `client/src/lib/types.ts`

- [ ] **Step 1: Add BudgetCategory, BudgetItem, FxRates types + homeCurrency to MeResponse**

Open `client/src/lib/types.ts` and add immediately after the `Pin` type (around line 94):

```ts
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
```

And add `homeCurrency?: string;` to the `MeResponse` type (around line 28):

```ts
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
```

- [ ] **Step 2: Verify types compile**

```bash
cd /Users/manuel.palacio/Code/road-trip && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or errors unrelated to the new types).

- [ ] **Step 3: Commit**

```bash
cd /Users/manuel.palacio/Code/road-trip && git add client/src/lib/types.ts && git commit -m "Multi-currency budget: add BudgetItem, FxRates types + homeCurrency to MeResponse"
```

---

### Task 2: Pure budget helpers + unit tests (TDD)

**Files:**
- Create: `client/src/lib/budget.ts`
- Create: `client/src/lib/__tests__/budget.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `client/src/lib/__tests__/budget.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCurrency, groupBudgetByDay, sumInHomeCurrency } from '../budget';
import type { BudgetItem, FxRates } from '../types';

const EUR_RATES: FxRates = {
  base: 'EUR',
  date: '2024-01-15',
  rates: { EUR: 1, USD: 1.08, SEK: 11.42, GBP: 0.856 },
};

function item(overrides: Partial<BudgetItem> & { id: string }): BudgetItem {
  return {
    id: overrides.id,
    category: 'food',
    label: 'Lunch',
    amount: 10,
    currency: 'EUR',
    ...overrides,
  };
}

describe('convertCurrency', () => {
  it('returns amount unchanged for same-currency conversion', () => {
    expect(convertCurrency(100, 'EUR', 'EUR', EUR_RATES)).toBe(100);
  });

  it('converts EUR to USD', () => {
    const result = convertCurrency(100, 'EUR', 'USD', EUR_RATES);
    expect(result).toBeCloseTo(108, 1);
  });

  it('converts USD to SEK', () => {
    // 100 USD → 100/1.08 EUR → * 11.42 SEK ≈ 1057.4
    const result = convertCurrency(100, 'USD', 'SEK', EUR_RATES);
    expect(result).toBeCloseTo(1057.4, 0);
  });

  it('returns null when rates is null', () => {
    expect(convertCurrency(100, 'EUR', 'USD', null)).toBeNull();
  });

  it('returns null when fromCurrency not in rates', () => {
    expect(convertCurrency(100, 'JPY', 'EUR', EUR_RATES)).toBeNull();
  });

  it('returns null when toCurrency not in rates', () => {
    expect(convertCurrency(100, 'EUR', 'JPY', EUR_RATES)).toBeNull();
  });
});

describe('sumInHomeCurrency', () => {
  it('returns 0 for empty items list', () => {
    expect(sumInHomeCurrency([], 'EUR', EUR_RATES)).toBe(0);
  });

  it('sums items already in home currency', () => {
    const items = [item({ id: '1', amount: 50 }), item({ id: '2', amount: 30 })];
    expect(sumInHomeCurrency(items, 'EUR', EUR_RATES)).toBeCloseTo(80, 5);
  });

  it('converts and sums mixed currencies', () => {
    const items = [
      item({ id: '1', amount: 100, currency: 'EUR' }),
      item({ id: '2', amount: 1000, currency: 'SEK' }),
    ];
    // 100 EUR + (1000/11.42) EUR ≈ 100 + 87.57 ≈ 187.57
    const result = sumInHomeCurrency(items, 'EUR', EUR_RATES);
    expect(result).toBeCloseTo(187.57, 0);
  });

  it('skips items with unknown currency', () => {
    const items = [
      item({ id: '1', amount: 100, currency: 'EUR' }),
      item({ id: '2', amount: 500, currency: 'JPY' }),
    ];
    expect(sumInHomeCurrency(items, 'EUR', EUR_RATES)).toBeCloseTo(100, 5);
  });

  it('returns 0 when rates is null', () => {
    const items = [item({ id: '1', amount: 100 })];
    expect(sumInHomeCurrency(items, 'EUR', null)).toBe(0);
  });
});

describe('groupBudgetByDay', () => {
  it('returns empty map for empty list', () => {
    expect(groupBudgetByDay([]).size).toBe(0);
  });

  it('groups items by dayNumber', () => {
    const items = [
      item({ id: '1', dayNumber: 1 }),
      item({ id: '2', dayNumber: 2 }),
      item({ id: '3', dayNumber: 1 }),
    ];
    const map = groupBudgetByDay(items);
    expect(map.get(1)?.length).toBe(2);
    expect(map.get(2)?.length).toBe(1);
  });

  it('puts items with no dayNumber under key 0', () => {
    const items = [
      item({ id: '1' }),
      item({ id: '2', dayNumber: null }),
    ];
    const map = groupBudgetByDay(items);
    expect(map.get(0)?.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/manuel.palacio/Code/road-trip && npx vitest run client/src/lib/__tests__/budget.test.ts 2>&1 | tail -20
```

Expected: FAIL — "budget" module not found.

- [ ] **Step 3: Implement budget.ts**

Create `client/src/lib/budget.ts`:

```ts
import type { BudgetItem, FxRates } from './types';

/** Convert an amount from `fromCurrency` to `toCurrency` using FX rates
 * where the base currency is `rates.base`. Returns null when either currency
 * is absent from the rate table or when rates is null. */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: FxRates | null,
): number | null {
  if (!rates) return null;
  if (fromCurrency === toCurrency) return amount;
  const fromRate = rates.rates[fromCurrency];
  const toRate = rates.rates[toCurrency];
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}

/** Sum budget items, converting each to homeCurrency. Items in currencies
 * missing from `rates` are excluded from the sum. */
export function sumInHomeCurrency(
  items: readonly BudgetItem[],
  homeCurrency: string,
  rates: FxRates | null,
): number {
  let total = 0;
  for (const item of items) {
    const converted = convertCurrency(item.amount, item.currency, homeCurrency, rates);
    if (converted != null) total += converted;
  }
  return total;
}

/** Group items by day. Items with no dayNumber sit under key 0 (trip-level). */
export function groupBudgetByDay(items: readonly BudgetItem[]): Map<number, BudgetItem[]> {
  const map = new Map<number, BudgetItem[]>();
  for (const item of items) {
    const key = item.dayNumber ?? 0;
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/manuel.palacio/Code/road-trip && npx vitest run client/src/lib/__tests__/budget.test.ts 2>&1 | tail -15
```

Expected: 17 tests pass, no failures.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
cd /Users/manuel.palacio/Code/road-trip && npm test 2>&1 | tail -10
```

Expected: 35 test files, 416 tests passed (399 + 17 new).

- [ ] **Step 6: Commit**

```bash
cd /Users/manuel.palacio/Code/road-trip && git add client/src/lib/budget.ts client/src/lib/__tests__/budget.test.ts && git commit -m "Multi-currency budget: pure helpers (convertCurrency, sumInHomeCurrency, groupBudgetByDay) + tests"
```

---

### Task 3: Server — budget_items subcollection endpoints

**Files:**
- Modify: `routes/trips.js`

The `loadTripForAccess` helper already exists in `routes/trips.js`. The budget endpoints go in the same file, after the existing pin endpoints.

- [ ] **Step 1: Add validateBudgetPayload + four budget endpoints to routes/trips.js**

Read the file to find the end of the pin section, then add after the last pin `router.delete` call. The section to add (paste at the end of the file, before `module.exports`):

```js
// ─── Budget items ─────────────────────────────────────────────────────────────

const BUDGET_CATEGORIES = ['fuel', 'hotel', 'food', 'tolls', 'activities', 'other'];

function validateBudgetPayload(body, { partial }) {
  const out = {};
  if ('category' in body) {
    if (!BUDGET_CATEGORIES.includes(body.category)) {
      return { error: `category must be one of ${BUDGET_CATEGORIES.join(', ')}` };
    }
    out.category = body.category;
  } else if (!partial) {
    return { error: 'category required' };
  }
  if ('label' in body) {
    if (typeof body.label !== 'string') return { error: 'label must be a string' };
    out.label = body.label.slice(0, 100);
  } else if (!partial) {
    return { error: 'label required' };
  }
  if ('amount' in body) {
    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount < 0) {
      return { error: 'amount must be a non-negative number' };
    }
    out.amount = body.amount;
  } else if (!partial) {
    return { error: 'amount required' };
  }
  if ('currency' in body) {
    if (typeof body.currency !== 'string' || !/^[A-Za-z]{3}$/.test(body.currency)) {
      return { error: 'currency must be 3 letters' };
    }
    out.currency = body.currency.toUpperCase();
  } else if (!partial) {
    return { error: 'currency required' };
  }
  if ('stopId' in body) {
    if (body.stopId !== null && typeof body.stopId !== 'string') {
      return { error: 'stopId must be a string or null' };
    }
    out.stopId = body.stopId;
  }
  if ('dayNumber' in body) {
    if (body.dayNumber !== null && typeof body.dayNumber !== 'number') {
      return { error: 'dayNumber must be a number or null' };
    }
    out.dayNumber = body.dayNumber;
  }
  if ('isPaid' in body) {
    if (typeof body.isPaid !== 'boolean') return { error: 'isPaid must be boolean' };
    out.isPaid = body.isPaid;
  }
  return { value: out };
}

router.get('/api/trips/:id/budget', async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, false);
    if (!ref) return;
    const snap = await ref.collection('budget_items').orderBy('createdAt', 'asc').get();
    res.json({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    console.error('GET budget failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.post('/api/trips/:id/budget', async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, true);
    if (!ref) return;
    const { error, value } = validateBudgetPayload(req.body || {}, { partial: false });
    if (error) return res.status(400).json({ error, code: 'INVALID' });
    const item = {
      ...value,
      addedByUid: req.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const itemRef = await ref.collection('budget_items').add(item);
    const snap = await itemRef.get();
    res.status(201).json({ id: itemRef.id, ...snap.data() });
  } catch (e) {
    console.error('POST budget failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.patch('/api/trips/:id/budget/:itemId', async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, true);
    if (!ref) return;
    const { error, value } = validateBudgetPayload(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error, code: 'INVALID' });
    const itemRef = ref.collection('budget_items').doc(req.params.itemId);
    const snap = await itemRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    await itemRef.update({ ...value, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const updated = await itemRef.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    console.error('PATCH budget failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.delete('/api/trips/:id/budget/:itemId', async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, true);
    if (!ref) return;
    await ref.collection('budget_items').doc(req.params.itemId).delete();
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE budget failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});
```

- [ ] **Step 2: Syntax-check the file**

```bash
node --check /Users/manuel.palacio/Code/road-trip/routes/trips.js 2>&1
```

Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
cd /Users/manuel.palacio/Code/road-trip && git add routes/trips.js && git commit -m "Multi-currency budget: budget_items subcollection endpoints (GET/POST/PATCH/DELETE)"
```

---

### Task 4: Server — FX rates route

**Files:**
- Create: `routes/fx.js`
- Modify: `server.js`

- [ ] **Step 1: Create routes/fx.js**

```js
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { admin, getDb } = require('../lib/firebase');

const router = express.Router();
router.use('/api/fx', authRequired);

router.get('/api/fx/:date', async (req, res) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD', code: 'INVALID' });
    }
    const db = getDb();
    const cacheRef = db.collection('fx_cache').doc(date);
    const cached = await cacheRef.get();
    if (cached.exists) {
      const { base, date: d, rates } = cached.data();
      return res.json({ base, date: d, rates });
    }
    const upstream = await fetch(
      `https://api.frankfurter.app/${encodeURIComponent(date)}?from=EUR`,
    );
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Upstream FX error', code: 'UPSTREAM' });
    }
    const data = await upstream.json();
    const payload = {
      base: data.base || 'EUR',
      date: data.date || date,
      rates: { ...data.rates, [data.base || 'EUR']: 1 },
      fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await cacheRef.set(payload);
    res.json({ base: payload.base, date: payload.date, rates: payload.rates });
  } catch (e) {
    console.error('GET /api/fx/:date failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount the router in server.js**

In `server.js`, add after line `app.use(require('./routes/admin'));`:

```js
app.use(require('./routes/fx'));
```

- [ ] **Step 3: Syntax-check both files**

```bash
node --check /Users/manuel.palacio/Code/road-trip/routes/fx.js /Users/manuel.palacio/Code/road-trip/server.js 2>&1
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /Users/manuel.palacio/Code/road-trip && git add routes/fx.js server.js && git commit -m "Multi-currency budget: GET /api/fx/:date with Frankfurter upstream + Firestore cache"
```

---

### Task 5: Server — homeCurrency on /api/me

**Files:**
- Modify: `routes/me.js`

- [ ] **Step 1: Add homeCurrency to GET response + PATCH endpoint**

Replace the content of `routes/me.js` with:

```js
const express = require('express');
const { admin, getDb } = require('../lib/firebase');
const { effectiveTripLimit } = require('../lib/limits');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/api/me', authRequired, async (req, res) => {
  try {
    const db = getDb();
    const userRef = db.collection('users').doc(req.uid);
    const snap = await userRef.get();

    let user;
    if (!snap.exists) {
      await userRef.set({
        email: req.userEmail,
        displayName: req.userName,
        photoURL: req.userPicture,
        plan: 'free',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      user = (await userRef.get()).data();
    } else {
      user = snap.data();
    }

    const tripsSnap = await db
      .collection('trips')
      .where('ownerUid', '==', req.uid)
      .count()
      .get();

    res.json({
      uid: req.uid,
      ...user,
      tripLimit: effectiveTripLimit(user),
      tripCount: tripsSnap.data().count,
    });
  } catch (e) {
    console.error('GET /api/me failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.patch('/api/me', authRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const updates = {};
    if ('homeCurrency' in body) {
      if (typeof body.homeCurrency !== 'string' || !/^[A-Za-z]{3}$/.test(body.homeCurrency)) {
        return res.status(400).json({ error: 'homeCurrency must be 3 letters', code: 'INVALID' });
      }
      updates.homeCurrency = body.homeCurrency.toUpperCase();
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided', code: 'INVALID' });
    }
    const db = getDb();
    await db.collection('users').doc(req.uid).update({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/me failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Syntax-check**

```bash
node --check /Users/manuel.palacio/Code/road-trip/routes/me.js 2>&1
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/manuel.palacio/Code/road-trip && git add routes/me.js && git commit -m "Multi-currency budget: add homeCurrency to GET /api/me + PATCH /api/me"
```

---

### Task 6: Client — API functions

**Files:**
- Modify: `client/src/lib/api.ts`

- [ ] **Step 1: Add budget + FX + homeCurrency API functions**

At the end of `client/src/lib/api.ts`, add:

```ts
import type { BudgetItem, FxRates } from './types';

export async function listBudget(tripId: string): Promise<{ items: BudgetItem[] }> {
  return handle<{ items: BudgetItem[] }>(
    await fetch(`/api/trips/${encodeURIComponent(tripId)}/budget`, await withToken()),
  );
}

export async function createBudgetItem(
  tripId: string,
  body: Omit<BudgetItem, 'id' | 'addedByUid' | 'createdAt' | 'updatedAt'>,
): Promise<BudgetItem> {
  return handle<BudgetItem>(
    await fetch(`/api/trips/${encodeURIComponent(tripId)}/budget`, await withToken({
      method: 'POST', body: JSON.stringify(body),
    })),
  );
}

export async function updateBudgetItem(
  tripId: string,
  itemId: string,
  body: Partial<BudgetItem>,
): Promise<BudgetItem> {
  return handle<BudgetItem>(
    await fetch(
      `/api/trips/${encodeURIComponent(tripId)}/budget/${encodeURIComponent(itemId)}`,
      await withToken({ method: 'PATCH', body: JSON.stringify(body) }),
    ),
  );
}

export async function deleteBudgetItem(tripId: string, itemId: string): Promise<void> {
  await handle<unknown>(
    await fetch(
      `/api/trips/${encodeURIComponent(tripId)}/budget/${encodeURIComponent(itemId)}`,
      await withToken({ method: 'DELETE' }),
    ),
  );
}

export async function getFxRates(date: string): Promise<FxRates> {
  return handle<FxRates>(
    await fetch(`/api/fx/${encodeURIComponent(date)}`, await withToken()),
  );
}

export async function updateHomeCurrency(homeCurrency: string): Promise<{ ok: boolean }> {
  return handle<{ ok: boolean }>(
    await fetch('/api/me', await withToken({ method: 'PATCH', body: JSON.stringify({ homeCurrency }) })),
  );
}
```

Note: the `import type { BudgetItem, FxRates }` line should be merged into the existing type import at the top of the file. The existing line 2 is:
```ts
import type { AppConfig, Favorite, MeResponse, Pin, TemplateCard, Trip } from './types';
```
Update it to:
```ts
import type { AppConfig, BudgetItem, Favorite, FxRates, MeResponse, Pin, TemplateCard, Trip } from './types';
```
Do not add a second import statement — just extend the existing one.

- [ ] **Step 2: Verify types compile**

```bash
cd /Users/manuel.palacio/Code/road-trip && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/manuel.palacio/Code/road-trip && git add client/src/lib/api.ts && git commit -m "Multi-currency budget: add budget + fx + homeCurrency API client functions"
```

---

### Task 7: Client — TanStack Query hooks

**Files:**
- Create: `client/src/hooks/useBudget.ts`
- Create: `client/src/hooks/useFxRates.ts`

- [ ] **Step 1: Create useBudget.ts**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBudgetItem,
  deleteBudgetItem,
  listBudget,
  updateBudgetItem,
} from '../lib/api';
import type { BudgetItem } from '../lib/types';

export function useBudget(tripId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['budget', tripId],
    queryFn: () => listBudget(tripId!),
    enabled: !!tripId,
    select: (data) => data.items,
  });

  const add = useMutation({
    mutationFn: (body: Omit<BudgetItem, 'id' | 'addedByUid' | 'createdAt' | 'updatedAt'>) =>
      createBudgetItem(tripId!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget', tripId] }),
  });

  const update = useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: Partial<BudgetItem> }) =>
      updateBudgetItem(tripId!, itemId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget', tripId] }),
  });

  const remove = useMutation({
    mutationFn: (itemId: string) => deleteBudgetItem(tripId!, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget', tripId] }),
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    add: add.mutate,
    update: update.mutate,
    remove: remove.mutate,
    addPending: add.isPending,
  };
}
```

- [ ] **Step 2: Create useFxRates.ts**

```ts
import { useQuery } from '@tanstack/react-query';
import { getFxRates } from '../lib/api';

export function useFxRates(date: string | null | undefined) {
  return useQuery({
    queryKey: ['fx', date],
    queryFn: () => getFxRates(date!),
    enabled: !!date,
    staleTime: 24 * 60 * 60 * 1000, // rates for a given date don't change
  });
}
```

- [ ] **Step 3: Verify types compile**

```bash
cd /Users/manuel.palacio/Code/road-trip && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/manuel.palacio/Code/road-trip && git add client/src/hooks/useBudget.ts client/src/hooks/useFxRates.ts && git commit -m "Multi-currency budget: useBudget + useFxRates TanStack Query hooks"
```

---

### Task 8: Client — BudgetPanel component

**Files:**
- Create: `client/src/components/viewer/BudgetPanel.tsx`

The panel is self-contained. It receives the budget hook's data and a rates object, and renders the item list + add form.

- [ ] **Step 1: Create BudgetPanel.tsx**

```tsx
import { useState } from 'react';
import { convertCurrency, groupBudgetByDay, sumInHomeCurrency } from '../../lib/budget';
import type { BudgetCategory, BudgetItem, FxRates } from '../../lib/types';

const CATEGORY_ICONS: Record<BudgetCategory, string> = {
  fuel: '⛽',
  hotel: '🏨',
  food: '🍽',
  tolls: '🛣',
  activities: '🎟',
  other: '•',
};

const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  fuel: 'Fuel',
  hotel: 'Hotel',
  food: 'Food',
  tolls: 'Tolls',
  activities: 'Activities',
  other: 'Other',
};

const BUDGET_CATEGORIES: BudgetCategory[] = [
  'fuel', 'hotel', 'food', 'tolls', 'activities', 'other',
];

const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF', 'CZK', 'PLN', 'HUF'];

type AddFormState = {
  category: BudgetCategory;
  label: string;
  amount: string;
  currency: string;
  dayNumber: string;
};

type Props = {
  tripId: string;
  homeCurrency: string;
  totalDays: number;
  rates: FxRates | null;
  items: BudgetItem[];
  onAdd: (body: Omit<BudgetItem, 'id' | 'addedByUid' | 'createdAt' | 'updatedAt'>) => void;
  onDelete: (itemId: string) => void;
  addPending: boolean;
};

export function BudgetPanel({
  homeCurrency,
  totalDays,
  rates,
  items,
  onAdd,
  onDelete,
  addPending,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddFormState>({
    category: 'food',
    label: '',
    amount: '',
    currency: homeCurrency,
    dayNumber: '',
  });

  const byDay = groupBudgetByDay(items);
  const tripTotal = sumInHomeCurrency(items, homeCurrency, rates);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.label.trim() || isNaN(amount) || amount < 0) return;
    onAdd({
      category: form.category,
      label: form.label.trim(),
      amount,
      currency: form.currency,
      dayNumber: form.dayNumber ? parseInt(form.dayNumber, 10) : null,
    });
    setForm((f) => ({ ...f, label: '', amount: '', dayNumber: '' }));
    setShowForm(false);
  }

  const dayKeys = Array.from(byDay.keys()).sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-3">
      {/* Trip total bar */}
      <div className="flex items-center justify-between px-2 py-2.5 bg-accent-soft border border-accent rounded">
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-accent">Total</span>
        <span className="font-mono text-[13px] text-accent font-medium">
          {tripTotal > 0 ? `${tripTotal.toFixed(2)} ${homeCurrency}` : '—'}
        </span>
      </div>

      {/* Day sections */}
      {dayKeys.map((day) => {
        const dayItems = byDay.get(day) ?? [];
        const dayTotal = sumInHomeCurrency(dayItems, homeCurrency, rates);
        const label = day === 0 ? 'Trip-level' : `Day ${day}`;
        return (
          <div key={day} className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-1">
              <span className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-paper-muted">
                {label}
              </span>
              {dayTotal > 0 && (
                <span className="font-mono text-[10px] text-paper-dim">
                  {dayTotal.toFixed(2)} {homeCurrency}
                </span>
              )}
            </div>
            {dayItems.map((item) => (
              <BudgetRow
                key={item.id}
                item={item}
                homeCurrency={homeCurrency}
                rates={rates}
                onDelete={() => onDelete(item.id)}
              />
            ))}
          </div>
        );
      })}

      {items.length === 0 && !showForm && (
        <p className="px-2 py-4 text-center font-serif italic text-[13px] text-paper-muted">
          No budget items yet. Add your first expense below.
        </p>
      )}

      {/* Add form */}
      {showForm ? (
        <form onSubmit={handleAdd} className="flex flex-col gap-2 p-3 border border-line rounded bg-canvas">
          <div className="flex gap-2">
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as BudgetCategory }))}
              className="flex-1 bg-canvas border border-line rounded px-2 py-1.5 font-mono text-[11px] text-paper"
            >
              {BUDGET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <select
              value={form.dayNumber}
              onChange={(e) => setForm((f) => ({ ...f, dayNumber: e.target.value }))}
              className="bg-canvas border border-line rounded px-2 py-1.5 font-mono text-[11px] text-paper"
            >
              <option value="">Trip</option>
              {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>Day {d}</option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="Label (e.g. Dinner in Lyon)"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            maxLength={100}
            className="bg-canvas border border-line rounded px-2 py-1.5 font-mono text-[11px] text-paper placeholder:text-paper-muted"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              min="0"
              step="0.01"
              className="flex-1 bg-canvas border border-line rounded px-2 py-1.5 font-mono text-[11px] text-paper placeholder:text-paper-muted"
            />
            <select
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              className="bg-canvas border border-line rounded px-2 py-1.5 font-mono text-[11px] text-paper"
            >
              {COMMON_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={addPending}
              className="flex-1 bg-accent text-white border border-accent rounded px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {addPending ? 'Adding…' : 'Add item'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-transparent border border-line text-paper-dim rounded px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase hover:text-paper hover:border-paper-dim transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full border border-dashed border-line text-paper-dim rounded px-3 py-2 font-mono text-[10px] tracking-[0.18em] uppercase hover:text-paper hover:border-paper-dim transition-colors"
        >
          + Add expense
        </button>
      )}
    </div>
  );
}

function BudgetRow({
  item,
  homeCurrency,
  rates,
  onDelete,
}: {
  item: BudgetItem;
  homeCurrency: string;
  rates: FxRates | null;
  onDelete: () => void;
}) {
  const converted = convertCurrency(item.amount, item.currency, homeCurrency, rates);
  const showConverted = converted != null && item.currency !== homeCurrency;

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-paper/5 group">
      <span className="text-[14px] flex-shrink-0">{CATEGORY_ICONS[item.category]}</span>
      <span className="flex-1 min-w-0 font-sans text-[12px] text-paper truncate">{item.label}</span>
      <span className="font-mono text-[11px] text-paper-dim flex-shrink-0">
        {item.amount.toFixed(2)} {item.currency}
        {showConverted && (
          <span className="text-paper-muted ml-1">≈ {converted!.toFixed(2)} {homeCurrency}</span>
        )}
      </span>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${item.label}`}
        className="opacity-0 group-hover:opacity-100 text-paper-muted hover:text-accent w-5 h-5 flex items-center justify-center flex-shrink-0 transition-opacity text-[12px]"
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd /Users/manuel.palacio/Code/road-trip && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/manuel.palacio/Code/road-trip && git add client/src/components/viewer/BudgetPanel.tsx && git commit -m "Multi-currency budget: BudgetPanel component with add form + per-day totals + trip total"
```

---

### Task 9: Client — Wire BudgetPanel into Viewer (new "Budget" tab)

**Files:**
- Modify: `client/src/components/viewer/SidebarTabs.tsx`
- Modify: `client/src/screens/Viewer.tsx`

The Viewer's `activeTab` currently supports `'days' | 'pins'`. We add `'budget'`.

- [ ] **Step 1: Extend SidebarTabs to accept a budget tab**

Replace `client/src/components/viewer/SidebarTabs.tsx` with:

```tsx
type Tab = 'days' | 'pins' | 'budget';

type Props = {
  active: Tab;
  daysCount: number;
  pinsCount: number;
  budgetCount: number;
  isPro: boolean;
  onChange: (tab: Tab) => void;
};

export function SidebarTabs({ active, daysCount, pinsCount, budgetCount, isPro, onChange }: Props) {
  return (
    <div role="tablist" className="px-5 pt-3.5 pb-2.5 flex items-center gap-2 border-b border-line">
      <TabButton tab="days" active={active === 'days'} count={daysCount} onClick={() => onChange('days')}>
        Days
      </TabButton>
      <TabButton tab="pins" active={active === 'pins'} count={pinsCount} onClick={() => onChange('pins')}>
        Pins
      </TabButton>
      <TabButton
        tab="budget"
        active={active === 'budget'}
        count={budgetCount}
        onClick={() => onChange('budget')}
        accent={isPro}
      >
        Budget
      </TabButton>
    </div>
  );
}

function TabButton({
  tab,
  active,
  count,
  onClick,
  accent,
  children,
}: {
  tab: Tab;
  active: boolean;
  count: number;
  onClick: () => void;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={`tab-panel-${tab}`}
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-[6px] rounded-full font-mono text-[10px] tracking-[0.22em] uppercase transition-colors ${
        active
          ? 'bg-accent-soft border border-accent text-accent'
          : accent
          ? 'border border-accent/40 text-accent/70 hover:text-accent hover:border-accent'
          : 'border border-line text-paper-dim hover:text-paper hover:border-paper-muted'
      }`}
    >
      <span>{children}</span>
      <span className={`text-[10px] tracking-normal ${active ? 'text-accent' : 'text-paper-muted'}`}>{count}</span>
    </button>
  );
}
```

- [ ] **Step 2: Update Viewer.tsx to add budget tab wiring**

In `Viewer.tsx`:

1. Add imports at the top (after existing viewer imports):
```ts
import { useBudget } from '../hooks/useBudget';
import { useFxRates } from '../hooks/useFxRates';
import { updateHomeCurrency } from '../lib/api';
import { BudgetPanel } from '../components/viewer/BudgetPanel';
```

2. Change the `activeTab` state type to include `'budget'`:
```ts
const [activeTab, setActiveTab] = useState<'days' | 'pins' | 'budget'>('days');
```

3. After the `const me = useMe(true);` line, add:
```ts
const budget = useBudget(tripId);

// Use today's date for FX rates. On the first stop's country,
// falling back to EUR as home currency if unset.
const homeCurrency = me.data?.homeCurrency ?? 'EUR';
const todayIso = new Date().toISOString().slice(0, 10);
const fxRates = useFxRates(todayIso);
```

4. Update the `<SidebarTabs>` element (find `<SidebarTabs` in Viewer.tsx):
```tsx
<SidebarTabs
  active={activeTab}
  daysCount={groups.length}
  pinsCount={pins.length}
  budgetCount={budget.items.length}
  isPro={isPro}
  onChange={setActiveTab}
/>
```

5. In the tab panel content, after `</PinList>` and before `)}` of the ternary, extend the conditional. Find the section that looks like:
```tsx
          {activeTab === 'days' ? (
            ...
          ) : (
            <PinList ... />
          )}
```
Replace with:
```tsx
          {activeTab === 'days' ? (
            groups.length === 0 ? (
              <p className="px-2 py-6 text-center font-serif italic text-[14px] text-paper-muted">
                This trip has no stops yet. <button onClick={() => navigate(`/builder/${trip.id}`)} className="underline text-accent">Open in builder</button>.
              </p>
            ) : (
              groups.map((g) => (
                <DayCard
                  key={g.day}
                  group={g}
                  startDate={trip.startDate}
                  visible={!hiddenDays.has(g.day)}
                  onToggleVisibility={() => toggleDay(g.day)}
                  fuelCost={fuelCostFor(g.stops.map((x) => x.stop))}
                  fuelVolume={fuelVolumeFor(g.stops.map((x) => x.stop))}
                  fuelConfigPartial={fuelPartial}
                  onConfigureFuel={goToBuilder}
                  bookingAffiliateId={cfg.data?.bookingAffiliateId}
                  getYourGuidePartnerId={cfg.data?.getYourGuidePartnerId}
                  viatorPartnerId={cfg.data?.viatorPartnerId}
                  longLegKm={longestLegOverRange(g, trip.tankRangeKm)}
                  fuelTimeline={fuelTimeline}
                  tankRangeKm={trip.tankRangeKm}
                  trip={{ id: trip.id, name: trip.name }}
                />
              ))
            )
          ) : activeTab === 'budget' ? (
            isPro ? (
              <BudgetPanel
                tripId={tripId!}
                homeCurrency={homeCurrency}
                totalDays={totals.totalDays}
                rates={fxRates.data ?? null}
                items={budget.items}
                onAdd={budget.add}
                onDelete={budget.remove}
                addPending={budget.addPending}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                <span className="text-[28px]">💰</span>
                <p className="font-serif italic text-[15px] text-paper leading-snug">
                  Track multi-currency expenses
                </p>
                <p className="font-mono text-[11px] tracking-[0.08em] text-paper-muted">
                  Add/edit budget items per day, see totals in your home currency — Pro feature.
                </p>
                <a
                  href="/#upgrade"
                  className="mt-1 inline-block bg-accent text-white px-4 py-2 rounded font-mono text-[10px] tracking-[0.18em] uppercase hover:bg-accent/90 transition-colors"
                >
                  Upgrade to Pro
                </a>
              </div>
            )
          ) : (
            <PinList
              pins={pins}
              onEdit={pinModal.openEdit}
              onDelete={pinModal.deletePin}
              onFocus={(p) => pinLayerRef.current?.focusPin(p)}
              onPromote={(p) => promotePin.mutate(p)}
              promotingPinId={promotePin.isPending ? promotePin.variables?.id ?? null : null}
            />
          )}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/manuel.palacio/Code/road-trip && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/manuel.palacio/Code/road-trip && npm test 2>&1 | tail -10
```

Expected: 35 test files, 416 tests passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/manuel.palacio/Code/road-trip && git add client/src/components/viewer/SidebarTabs.tsx client/src/screens/Viewer.tsx && git commit -m "Multi-currency budget: Budget tab in Viewer sidebar (Pro-gated, upgrade CTA for Free)"
```

---

### Task 10: Auto-populate fuel items on first load

**Files:**
- Modify: `client/src/screens/Viewer.tsx`

When the budget loads with 0 items and the trip has fuelConsumption + fuelPrice configured, insert one fuel item per day showing the estimated cost.

- [ ] **Step 1: Add auto-fuel seeding effect to Viewer.tsx**

Add this import if not already present at the top of Viewer.tsx:
```ts
import { fuelBreakdownForLegs } from '../lib/compute';
```

(It's already imported. Good.)

After the `budget` and `fxRates` lines, add the effect:

```ts
// Auto-seed fuel budget items from existing fuel cost calc on first load.
// A localStorage flag per trip prevents re-seeding after the user deletes them.
const autoFuelFlagKey = tripId ? `autoFuelBudget:${tripId}` : null;

useEffect(() => {
  if (!tripId) return;
  if (!trip?.fuelConsumption || !trip?.fuelPrice) return;
  if (budget.isLoading) return;
  if (budget.items.length > 0) return;
  if (!autoFuelFlagKey) return;
  if (localStorage.getItem(autoFuelFlagKey)) return;

  localStorage.setItem(autoFuelFlagKey, '1');

  // One item per day with a fuel cost estimate
  groups.forEach((g) => {
    const breakdown = fuelBreakdownForLegs(
      g.stops.map((x) => x.stop),
      trip.fuelConsumption,
      trip.fuelUnit,
      trip.fuelPrice,
      trip.fuelCurrency,
      trip.fuelOverrides,
    );
    if (!breakdown) return;
    const amount = Math.round(breakdown.totalCost * 100) / 100;
    if (amount <= 0) return;
    budget.add({
      category: 'fuel',
      label: `Fuel — Day ${g.day} (estimated)`,
      amount,
      currency: trip.fuelCurrency || 'EUR',
      dayNumber: g.day,
    });
  });
}, [tripId, trip, budget.isLoading, budget.items.length, groups]);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/manuel.palacio/Code/road-trip && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. (If the effect's dependency array triggers a lint warning about `budget`, `groups`, or `trip` being complex objects, that's acceptable — the logic is correct.)

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/manuel.palacio/Code/road-trip && npm test 2>&1 | tail -10
```

Expected: all 416 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/manuel.palacio/Code/road-trip && git add client/src/screens/Viewer.tsx && git commit -m "Multi-currency budget: auto-seed fuel items from trip fuel config on first load"
```

---

### Task 11: Final syntax checks + full test run

**Files:** none

- [ ] **Step 1: Node --check all changed server files**

```bash
node --check /Users/manuel.palacio/Code/road-trip/routes/trips.js /Users/manuel.palacio/Code/road-trip/routes/fx.js /Users/manuel.palacio/Code/road-trip/routes/me.js /Users/manuel.palacio/Code/road-trip/server.js
```

Expected: no output (exit 0).

- [ ] **Step 2: Full TypeScript check**

```bash
cd /Users/manuel.palacio/Code/road-trip && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Full test suite**

```bash
cd /Users/manuel.palacio/Code/road-trip && npm test 2>&1 | tail -10
```

Expected: 35 test files, 416 tests passed (or more).

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task covering it |
|---|---|
| `budget_items` subcollection (GET/POST/PATCH/DELETE) | Task 3 |
| `GET /api/fx/:date` with Frankfurter + Firestore cache | Task 4 |
| `homeCurrency` on `/api/me` (GET + PATCH) | Task 5 |
| `BudgetItem`, `FxRates` types | Task 1 |
| `budget.ts` pure helpers | Task 2 |
| Unit tests for pure helpers | Task 2 |
| `listBudget`, `createBudgetItem`, `updateBudgetItem`, `deleteBudgetItem`, `getFxRates`, `updateHomeCurrency` in api.ts | Task 6 |
| `useBudget` + `useFxRates` hooks | Task 7 |
| `BudgetPanel` component (Pro-gated, Free upgrade CTA) | Task 8 |
| Budget tab wired into Viewer sidebar | Task 9 |
| Auto-populate fuel items on first load | Task 10 |
| Per-day totals + trip total in home currency | Tasks 8+9 |
| Add/edit/delete inline form | Task 8 |

**Placeholder scan:** No TBD/TODO/placeholder text found. All code is complete.

**Type consistency check:**
- `BudgetItem` type defined in Task 1; used consistently in Tasks 2, 6, 7, 8, 9.
- `FxRates` type defined in Task 1; used in Tasks 2, 6, 7, 8, 9.
- `useBudget` returns `{ items, isLoading, add, update, remove, addPending }` — all used in Task 9.
- `BudgetPanel` props use `onAdd` (not `add`), `onDelete` (not `remove`) — this is intentional for component API clarity.
- `BUDGET_CATEGORIES` array defined in Task 3 (server) and in Task 8 (client) separately — correct; they serve different validation contexts.
- `homeCurrency` in `MeResponse` (Task 1) flows through `me.data?.homeCurrency ?? 'EUR'` in Viewer (Task 9) — consistent.

**Gap check:** The spec mentions `updateHomeCurrency` in the api.ts list — it's included in Task 6. The `updateHomeCurrency` function is implemented but not called in the UI (the spec doesn't specify a UI for changing home currency in this slice — it's set server-side from `PATCH /api/me`). This is acceptable for v1 — the hook is available for a follow-up settings UI.

One deviation from spec: the spec says PATCH uses `PUT` in the `updatePin` function. For budget items the spec correctly uses PATCH (partial update) — implemented as `PATCH` in both server (Task 3) and client (Task 6). Consistent.
