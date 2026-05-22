# Monetization Plan

## Assessment

**Short verdict: Yes, this app is worth monetizing.** The infrastructure for it is already partially in place — a Free/Pro plan split exists in the code, hard limits are enforced at the API level, and an affiliate revenue stream is already wired up. The foundation is solid; it just needs to be deliberately shaped into a complete monetization strategy.

---

## What's Already in the Code

Before recommending anything new, here's what already generates or is set up to generate revenue:

- **Free/Pro plan split** — `effectiveTripLimit()` enforces **2 trips** for free users, **10 for Pro**, with per-user overrides possible. The 402 error on limit hit nudges users toward upgrading.
- **Booking.com affiliate links** — `bookingUrlForStop()` in `trips.js` generates affiliate search URLs with a `BOOKING_AFFILIATE_ID` env var and pre-fills check-in/check-out dates based on `trip.startDate + dayNumber`. These appear in the PDF export at every overnight/destination stop. **This is passive income that requires zero user friction.**
- **Pro-gated publishing** — only `user.plan === 'pro'` users can publish templates to the community gallery. This is the single most powerful gate available.
- **Community template gallery** — already queryable, sortable by `cloneCount`, with tag filtering. This is a built-in growth loop: popular templates drive signups.
- **PDF & GPX export** — already functional for all users. Could be gated.

---

## The Monetization Plan

### Tier 1 — Free (Acquisition)

Keep free generous enough to be genuinely useful, but with clear friction on the things people care most about at trip time.

| What | Limit |
|---|---|
| Trips | **2** (already enforced) |
| Pins per trip | 10 |
| PDF/GPX export | ✅ (keep free — affiliate revenue inside) |
| Share link | ✅ |
| Template cloning | ✅ (already in place) |
| Template publishing | ❌ |
| Collaborators | ❌ |

### Tier 2 — Pro (~€4–6/month or €40/year)

The Pro tier already has a technical identity; it needs a stronger value proposition. The upgrade should feel like unlocking a genuine power user tool, not just removing a cap.

**What Pro unlocks:**

- **Unlimited trips** — raise from 10 to unlimited to remove any hesitation
- **Unlimited pins per trip**
- **Collaboration** (already coded in Firestore rules) — add a UI for inviting collaborators
- **Template publishing** (already gated behind `plan === 'pro'`) — the most unique Pro hook
- **Priority on the template gallery** — Pro-published templates get a "Pro route" badge, surfacing them above anonymous ones
- **AI trip assistant** (Slice 17, already planned) — the killer feature; make this the headline Pro benefit
- **Custom fuel profiles** saved across trips (vs. re-entering every time)

---

## Revenue Stream 2 — Affiliate (Already Built)

The Booking.com affiliate integration is the most immediately actionable thing in the codebase. Right now it only fires on PDF export. Extend it to:

1. **The shared read-only trip view** — the biggest monetization surface. Anyone who receives a share link is a warm lead. Showing "🏨 Book a hotel in [city]" per overnight stop in the share view could generate affiliate clicks from people who aren't even users.
2. **The trip detail page** — show a subtle hotel CTA next to overnight stops inline, not just in PDF.
3. **Add a fuel/car rental affiliate** (e.g. Rentalcars.com, ViaMichelin) alongside Booking.com — both have affiliate programs and are a natural fit for a road trip audience.

---

## Revenue Stream 3 — The Template Marketplace

The template gallery has a `cloneCount` field already accumulating social proof. This is a slow-burn but high-leverage growth loop:

- **Phase 1 (now):** Free to publish (Pro only), free to clone — builds content flywheel
- **Phase 2:** "Featured routes" — curated by you or high-quality Pro users, shown prominently
- **Phase 3 (optional):** Premium templates at €0.99–2.99 — a creator monetizes their expertise, you take a platform cut. Only viable once the gallery has meaningful traffic.

---

## Revenue Stream 4 — One-Time Export Upgrade

A **one-time in-app purchase** for a premium PDF (better layout, map image embedded, cover page) gives non-subscribers a reason to pay without requiring a subscription. Requires payment integration but no subscription infrastructure.

---

## Implementation Priority

1. **Extend affiliate links to the share view** — zero backend work, immediate passive revenue, no user friction
2. **Add a paywall/upgrade CTA** on the Free limit 402 response in the UI — the backend already returns the right error code; the frontend just needs a polished modal
3. **Set `FREE_TRIP_LIMIT=2` and `PRO_TRIP_LIMIT=unlimited`** in production env — the limit logic already reads from env vars
4. **Wire up a payment provider** (Stripe) — connect it to the `user.plan` field in Firestore that the limit logic already reads
5. **Make the AI assistant (Slice 17) the headline Pro feature** in marketing

---

## Cost Reality Check

Current infra is Firebase + Cloud Run. At low user counts, costs are negligible. The main cost to watch at scale is the **Google Maps API** (used for geocoding/routing). A Pro tier at €5/month needs roughly **~80+ paying users** to cover a €400/month Maps API bill at moderate usage — very achievable.
