const crypto = require('crypto');
const express = require('express');
const PDFDocument = require('pdfkit');
const { admin, getAuth, getDb } = require('../lib/firebase');
const { effectiveTripLimit } = require('../lib/limits');

// shared/*.js modules are ESM (so Vite can tree-shake them for the client).
// This CJS file loads them via dynamic import — each Promise resolves once and
// is cached.
const fuelModulePromise = import('../shared/fuel.js');
const pdfSummaryPromise = import('../shared/pdf-summary.js');
const schedulePromise = import('../shared/schedule.js');
const tripPayloadPromise = import('../shared/trip-payload.js');
const { authRequired } = require('../middleware/auth');
const limits = require('../middleware/rate-limit');

const router = express.Router();

router.use('/api/trips', authRequired);

const PIN_CATEGORIES = ['food', 'hotel', 'scenic', 'fuel', 'landmark', 'other'];
const PIN_PRIORITIES = ['must', 'want', 'maybe'];
const PIN_UPDATABLE_FIELDS = ['name', 'category', 'notes', 'lat', 'lng', 'priority'];

function validatePinPayload(body, { partial }) {
  const out = {};
  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return { error: 'name is required' };
    }
    out.name = body.name.trim().slice(0, 80);
  } else if (!partial) {
    return { error: 'name is required' };
  }
  if ('category' in body) {
    if (!PIN_CATEGORIES.includes(body.category)) {
      return { error: `category must be one of: ${PIN_CATEGORIES.join(', ')}` };
    }
    out.category = body.category;
  } else if (!partial) {
    return { error: 'category is required' };
  }
  if ('notes' in body) {
    out.notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : '';
  } else if (!partial) {
    out.notes = '';
  }
  if ('priority' in body) {
    if (!PIN_PRIORITIES.includes(body.priority)) {
      return { error: `priority must be one of: ${PIN_PRIORITIES.join(', ')}` };
    }
    out.priority = body.priority;
  } else if (!partial) {
    out.priority = 'want';
  }
  if ('lat' in body) {
    if (typeof body.lat !== 'number' || !Number.isFinite(body.lat)) {
      return { error: 'lat must be a finite number' };
    }
    out.lat = body.lat;
  } else if (!partial) {
    return { error: 'lat is required' };
  }
  if ('lng' in body) {
    if (typeof body.lng !== 'number' || !Number.isFinite(body.lng)) {
      return { error: 'lng must be a finite number' };
    }
    out.lng = body.lng;
  } else if (!partial) {
    return { error: 'lng is required' };
  }
  return { value: out };
}

async function loadTripForAccess(req, res, requireWrite) {
  const db = getDb();
  const ref = db.collection('trips').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    return null;
  }
  const data = snap.data();
  const ok = requireWrite ? canWrite(data, req.uid) : canRead(data, req.uid);
  if (!ok) {
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    return null;
  }
  return ref;
}

function canRead(data, uid) {
  return data.ownerUid === uid || (data.collaborators || []).includes(uid);
}

function canWrite(data, uid) {
  return canRead(data, uid);
}

function canDelete(data, uid) {
  return data.ownerUid === uid;
}

router.post('/api/trips', limits.tripCreate, async (req, res) => {
  try {
    const db = getDb();

    // Plan limit enforcement: both Free and Pro have caps now (2 / 10
    // by default). Resolved through effectiveTripLimit so future env
    // changes apply uniformly.
    const userSnap = await db.collection('users').doc(req.uid).get();
    const user = userSnap.exists ? userSnap.data() : null;
    const limit = effectiveTripLimit(user);
    const countSnap = await db
      .collection('trips')
      .where('ownerUid', '==', req.uid)
      .count()
      .get();
    if (countSnap.data().count >= limit) {
      const isPro = user && user.plan === 'pro';
      return res.status(402).json({
        error: isPro
          ? `Pro plan is capped at ${limit} trip${limit === 1 ? '' : 's'}. Contact support to raise the cap.`
          : `Free plan is capped at ${limit} trip${limit === 1 ? '' : 's'}. Upgrade to Pro to create more.`,
        code: 'TRIP_LIMIT_REACHED',
        limit,
      });
    }

    const body = req.body || {};
    const { collectTripFields, CREATE_TRIP_EXTRA_FIELDS } = await tripPayloadPromise;
    const extra = collectTripFields(body, CREATE_TRIP_EXTRA_FIELDS);
    if (extra.error) {
      return res.status(400).json({ error: extra.error, code: 'INVALID' });
    }
    const trip = {
      ownerUid: req.uid,
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled trip',
      description: typeof body.description === 'string' ? body.description : '',
      coverEmoji: typeof body.coverEmoji === 'string' && body.coverEmoji ? body.coverEmoji : '🚗',
      startDate: typeof body.startDate === 'string' ? body.startDate : null,
      maxKmPerDay: typeof body.maxKmPerDay === 'number' && body.maxKmPerDay > 0 ? body.maxKmPerDay : 600,
      stops: Array.isArray(body.stops) ? body.stops : [],
      totalKm: 0,
      totalDays: 0,
      countries: [],
      ...extra.value,
      collaborators: [],
      shareToken: null,
      isShared: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('trips').add(trip);
    const snap = await ref.get();
    res.status(201).json({ id: ref.id, ...snap.data() });
  } catch (e) {
    console.error('POST /api/trips failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.get('/api/trips', async (req, res) => {
  try {
    const db = getDb();
    const [ownedSnap, collabSnap] = await Promise.all([
      db.collection('trips').where('ownerUid', '==', req.uid).get(),
      db.collection('trips').where('collaborators', 'array-contains', req.uid).get(),
    ]);
    const map = new Map();
    for (const doc of [...ownedSnap.docs, ...collabSnap.docs]) {
      map.set(doc.id, { id: doc.id, ...doc.data() });
    }
    const trips = [...map.values()].sort((a, b) => {
      const ta = a.updatedAt?.toMillis?.() || 0;
      const tb = b.updatedAt?.toMillis?.() || 0;
      return tb - ta;
    });
    res.json({ trips });
  } catch (e) {
    console.error('GET /api/trips failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.get('/api/trips/:id', async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    const data = snap.data();
    if (!canRead(data, req.uid)) return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    res.json({ id: snap.id, ...data });
  } catch (e) {
    console.error('GET /api/trips/:id failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.put('/api/trips/:id', limits.tripUpdate, async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    if (!canWrite(snap.data(), req.uid)) return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });

    const body = req.body || {};
    const { collectTripFields, UPDATABLE_TRIP_FIELDS } = await tripPayloadPromise;
    const collected = collectTripFields(body, UPDATABLE_TRIP_FIELDS);
    if (collected.error) {
      return res.status(400).json({ error: collected.error, code: 'INVALID' });
    }
    const update = collected.value;
    update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await ref.update(update);
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    console.error('PUT /api/trips/:id failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});


router.delete('/api/trips/:id', async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    if (!canDelete(snap.data(), req.uid)) return res.status(403).json({ error: 'Owner only', code: 'FORBIDDEN' });

    const pinsSnap = await ref.collection('pins').get();
    const batch = db.batch();
    pinsSnap.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(ref);
    await batch.commit();
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/trips/:id failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.get('/api/trips/:id/pins', async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, false);
    if (!ref) return;
    const snap = await ref.collection('pins').orderBy('createdAt', 'asc').get();
    const pins = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ pins });
  } catch (e) {
    console.error('GET /api/trips/:id/pins failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.post('/api/trips/:id/pins', limits.pinCreate, async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, true);
    if (!ref) return;
    const { error, value } = validatePinPayload(req.body || {}, { partial: false });
    if (error) return res.status(400).json({ error, code: 'INVALID' });
    const pin = {
      ...value,
      addedByUid: req.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const pinRef = await ref.collection('pins').add(pin);
    const snap = await pinRef.get();
    res.status(201).json({ id: pinRef.id, ...snap.data() });
  } catch (e) {
    console.error('POST /api/trips/:id/pins failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.put('/api/trips/:id/pins/:pinId', async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, true);
    if (!ref) return;
    const pinRef = ref.collection('pins').doc(req.params.pinId);
    const pinSnap = await pinRef.get();
    if (!pinSnap.exists) return res.status(404).json({ error: 'Pin not found', code: 'NOT_FOUND' });
    const body = req.body || {};
    const filtered = {};
    for (const key of PIN_UPDATABLE_FIELDS) {
      if (key in body) filtered[key] = body[key];
    }
    const { error, value } = validatePinPayload(filtered, { partial: true });
    if (error) return res.status(400).json({ error, code: 'INVALID' });
    value.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await pinRef.update(value);
    const updated = await pinRef.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    console.error('PUT /api/trips/:id/pins/:pinId failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

function escapeXml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[c]));
}

function sanitizeFilename(s) {
  const trimmed = String(s || '').trim() || 'road-trip';
  return trimmed.replace(/[^A-Za-z0-9\-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'road-trip';
}

// Mirrors isFuelStop() in client/src/lib/compute.ts. Legacy fuel stops were
// saved as type='waypoint' + category='fuel' (pre-issue #52).
function isFuelStop(s) {
  return s.type === 'fuel' || (s.type === 'waypoint' && s.category === 'fuel');
}

function buildGpx(trip, pins) {
  const stops = Array.isArray(trip.stops) ? trip.stops : [];
  const wptLines = [];
  for (const s of stops) {
    if (typeof s.lat !== 'number' || typeof s.lng !== 'number') continue;
    const desc = (s.highlights || []).join(' · ');
    wptLines.push(
      `  <wpt lat="${s.lat}" lon="${s.lng}">\n` +
      `    <name>${escapeXml(s.label || s.name || '')}</name>\n` +
      (desc ? `    <desc>${escapeXml(desc)}</desc>\n` : '') +
      `  </wpt>`,
    );
  }
  for (const p of pins) {
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
    const cat = p.category ? `[${p.category}] ` : '';
    wptLines.push(
      `  <wpt lat="${p.lat}" lon="${p.lng}">\n` +
      `    <name>${escapeXml(cat + (p.name || ''))}</name>\n` +
      (p.notes ? `    <desc>${escapeXml(p.notes)}</desc>\n` : '') +
      `  </wpt>`,
    );
  }
  // Fuel stops are emitted as standalone <wpt> above (POI alongside the
  // route) but excluded from the <rtept> route block — they're pit-stop
  // suggestions, not turn points.
  const rtepts = stops
    .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number' && !isFuelStop(s))
    .map(
      (s) =>
        `    <rtept lat="${s.lat}" lon="${s.lng}"><name>${escapeXml(s.label || s.name || '')}</name></rtept>`,
    )
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Road Trip" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <metadata>',
    `    <name>${escapeXml(trip.name || 'Road trip')}</name>`,
    trip.description ? `    <desc>${escapeXml(trip.description)}</desc>` : '',
    '  </metadata>',
    wptLines.join('\n'),
    rtepts ? `  <rte>\n    <name>${escapeXml(trip.name || 'Road trip')}</name>\n${rtepts}\n  </rte>` : '',
    '</gpx>',
  ].filter(Boolean).join('\n');
}

function bookingUrlForStop(stop, trip) {
  // Returns null when the stop has no usable name; otherwise a Booking.com
  // searchresults URL with dates pre-filled (if trip.startDate is set) and
  // an aid= affiliate tag (if BOOKING_AFFILIATE_ID is configured).
  const name = (stop.label || stop.name || '').trim();
  if (!name) return null;
  const day = stop.dayNumber && stop.dayNumber > 0 ? stop.dayNumber : 1;
  let checkin = null;
  let checkout = null;
  if (trip.startDate) {
    const d = new Date(`${trip.startDate}T00:00:00Z`);
    if (!isNaN(d.getTime())) {
      const ci = new Date(d);
      ci.setUTCDate(ci.getUTCDate() + day - 1);
      const co = new Date(d);
      co.setUTCDate(co.getUTCDate() + day);
      checkin = ci.toISOString().slice(0, 10);
      checkout = co.toISOString().slice(0, 10);
    }
  }
  const params = new URLSearchParams({ ss: name, group_adults: '2' });
  if (checkin && checkout) {
    params.set('checkin', checkin);
    params.set('checkout', checkout);
  }
  const aid = process.env.BOOKING_AFFILIATE_ID;
  if (aid) params.set('aid', aid);
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

function groupStopsByDay(stops) {
  const map = new Map();
  for (const s of stops) {
    const d = s.dayNumber || 1;
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(s);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

router.get('/api/trips/:id/export/gpx', async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, false);
    if (!ref) return;
    const snap = await ref.get();
    const trip = snap.data();
    const pinsSnap = await ref.collection('pins').orderBy('createdAt', 'asc').get();
    const pins = pinsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const xml = buildGpx(trip, pins);
    const filename = `${sanitizeFilename(trip.name)}.gpx`;
    res.setHeader('Content-Type', 'application/gpx+xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  } catch (e) {
    console.error('GET /api/trips/:id/export/gpx failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

// ─── PDF format helpers ───────────────────────────────────────────────────────

// Builds the fuel helper functions used by both PDF formats.
function makeFuelHelpers(fuel, trip) {
  const breakdownForStops = (stops) => fuel.fuelBreakdownForLegs(
    stops, trip.fuelConsumption, trip.fuelUnit, trip.fuelPrice, trip.fuelCurrency, trip.fuelOverrides,
  );
  const breakdownToStr = (b) => fuel.formatBreakdown(b, 'en-US');
  const volumeForStops = (stops) => fuel.fuelVolumeForLegs(stops, trip.fuelConsumption, trip.fuelUnit);
  const volumeToStr = (stops) => fuel.formatVolume(volumeForStops(stops), trip.fuelUnit);
  const fillUpsForStops = (stops) => fuel.formatFillUps(
    volumeForStops(stops), trip.tankSizeLitres, trip.fuelUnit,
  );
  return { breakdownForStops, breakdownToStr, volumeForStops, volumeToStr, fillUpsForStops };
}

function formatPlain(doc, trip, pins, fuelHelpers, arrivalsByStopId) {
  const { breakdownForStops, breakdownToStr, volumeToStr, fillUpsForStops } = fuelHelpers;

  // Header
  doc
    .font('Times-Italic')
    .fontSize(28)
    .text(trip.name || 'Untitled trip', { align: 'left' });
  if (trip.description) {
    doc.moveDown(0.4).font('Times-Italic').fontSize(12).fillColor('#555').text(trip.description);
  }

  // Totals strip
  const stopsForPricing = Array.isArray(trip.stops) ? trip.stops : [];
  const totals = [];
  if (typeof trip.totalKm === 'number') totals.push(`${trip.totalKm.toLocaleString('en-US')} km`);
  if (typeof trip.totalDays === 'number') totals.push(`${trip.totalDays} day${trip.totalDays === 1 ? '' : 's'}`);
  if (Array.isArray(trip.countries) && trip.countries.length) totals.push(trip.countries.join(' '));
  const totalBreakdownStr = breakdownToStr(breakdownForStops(stopsForPricing));
  if (totalBreakdownStr) totals.push(`Est. fuel ${totalBreakdownStr}`);
  const totalVolumeStr = volumeToStr(stopsForPricing);
  if (totalVolumeStr) {
    const fillUpsStr = fillUpsForStops(stopsForPricing);
    totals.push(fillUpsStr ? `${totalVolumeStr} · ${fillUpsStr}` : totalVolumeStr);
  }
  doc
    .moveDown(0.8)
    .fillColor('#000')
    .font('Helvetica')
    .fontSize(10)
    .text(totals.join('  ·  '));

  // Days
  const stops = Array.isArray(trip.stops) ? trip.stops : [];
  const grouped = groupStopsByDay(stops);
  for (const [day, dayStops] of grouped) {
    const dayKm = dayStops.reduce((acc, s) => acc + (s.kmFromPrevious || 0), 0);
    const dayBreakdownStr = breakdownToStr(breakdownForStops(dayStops));
    const dayCostStr = dayBreakdownStr ? `  ·  ${dayBreakdownStr}` : '';
    const dayVolumeStr = volumeToStr(dayStops);
    const dayVolStr = dayVolumeStr ? `  ·  ${dayVolumeStr}` : '';
    doc
      .moveDown(1.1)
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#000')
      .text(`Day ${day}${dayKm > 0 ? `  ·  ${dayKm} km${dayCostStr}${dayVolStr}` : ''}`, { continued: false });
    doc.moveDown(0.3);
    for (const stop of dayStops) {
      const km = stop.kmFromPrevious ? `${stop.kmFromPrevious} km` : '';
      const dur = stop.durationFromPrevious || '';
      const eta = arrivalsByStopId && arrivalsByStopId.get(stop.id);
      const at = eta && eta.arrival ? `arr ${eta.arrival}${eta.departure ? ` · dep ${eta.departure}` : ''}` : '';
      const meta = [at, km, dur].filter(Boolean).join(' · ');
      doc.font('Helvetica').fontSize(11).fillColor('#000').text(stop.label || stop.name || '—', { continued: !!meta });
      if (meta) {
        doc.font('Helvetica').fontSize(9).fillColor('#666').text(`   ${meta}`);
      }
      if (stop.highlights && stop.highlights.length) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#444').text(`   ${stop.highlights.join(' · ')}`);
      }
      if (stop.type === 'overnight' || stop.type === 'destination') {
        const bookingUrl = bookingUrlForStop(stop, trip);
        if (bookingUrl) {
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#2a6dba')
            .text(`   🏨 Find a hotel: ${bookingUrl}`, { link: bookingUrl, underline: false });
        }
      }
      doc.moveDown(0.2);
    }
  }

  // Pins
  if (pins.length) {
    doc
      .moveDown(1.2)
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#000')
      .text('Pins');
    doc.moveDown(0.3);
    for (const pin of pins) {
      const cat = pin.category ? `[${pin.category}] ` : '';
      doc.font('Helvetica').fontSize(11).fillColor('#000').text(`${cat}${pin.name || ''}`);
      if (pin.notes) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#444').text(`   ${pin.notes}`);
      }
      doc.moveDown(0.15);
    }
  }

  doc.moveDown(2);
  doc.font('Helvetica').fontSize(8).fillColor('#999').text('Generated by Road Trip', { align: 'center' });
}

function formatBranded(doc, trip, pins, fuelHelpers, brandedSummaryRows, arrivalsByStopId) {
  const { breakdownForStops, breakdownToStr, volumeToStr, fillUpsForStops } = fuelHelpers;
  const stops = Array.isArray(trip.stops) ? trip.stops : [];

  // ── Page 1: Cover ──────────────────────────────────────────────────────────
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 56;

  // Accent bar at top
  doc.rect(0, 0, pageWidth, 6).fill('#E76F51');

  // Cover emoji — centered, large
  const emoji = trip.coverEmoji || '🚗';
  doc
    .fillColor('#000')
    .font('Helvetica')
    .fontSize(64)
    .text(emoji, margin, 80, { width: pageWidth - margin * 2, align: 'center' });

  // Trip name
  doc
    .moveDown(0.6)
    .font('Helvetica-Bold')
    .fontSize(28)
    .fillColor('#111')
    .text(trip.name || 'Untitled trip', { align: 'center' });

  // Country flags
  if (Array.isArray(trip.countries) && trip.countries.length) {
    doc
      .moveDown(0.5)
      .font('Helvetica')
      .fontSize(20)
      .fillColor('#333')
      .text(trip.countries.join('  '), { align: 'center' });
  }

  // Date range
  if (trip.startDate && typeof trip.totalDays === 'number' && trip.totalDays > 0) {
    const start = new Date(`${trip.startDate}T00:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + trip.totalDays - 1);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    doc
      .moveDown(0.5)
      .font('Helvetica')
      .fontSize(13)
      .fillColor('#555')
      .text(`${fmt(start)} – ${fmt(end)}`, { align: 'center' });
  } else if (trip.startDate) {
    doc
      .moveDown(0.5)
      .font('Helvetica')
      .fontSize(13)
      .fillColor('#555')
      .text(trip.startDate, { align: 'center' });
  }

  // Quick stats row
  const statParts = [];
  if (typeof trip.totalKm === 'number') statParts.push(`${trip.totalKm.toLocaleString('en-US')} km`);
  if (typeof trip.totalDays === 'number') statParts.push(`${trip.totalDays} day${trip.totalDays === 1 ? '' : 's'}`);
  if (statParts.length) {
    doc
      .moveDown(0.6)
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#777')
      .text(statParts.join('  ·  '), { align: 'center' });
  }

  // Footer
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#bbb')
    .text('Generated by Road Trip', margin, pageHeight - margin, { width: pageWidth - margin * 2, align: 'center' });

  // ── Pages 2+: Per-day spreads ───────────────────────────────────────────────
  const grouped = groupStopsByDay(stops);
  for (const [day, dayStops] of grouped) {
    doc.addPage();

    // Accent bar
    doc.rect(0, 0, pageWidth, 4).fill('#E76F51');

    // Day number heading
    const dayKm = dayStops.reduce((acc, s) => acc + (s.kmFromPrevious || 0), 0);
    let dayHeading = `Day ${day}`;
    if (trip.startDate) {
      const d = new Date(`${trip.startDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + day - 1);
      const dayDate = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
      dayHeading = `Day ${day}  ·  ${dayDate}`;
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#111')
      .text(dayHeading, margin, 28, { width: pageWidth - margin * 2 });

    // Day stats
    const dayBreakdownStr = breakdownToStr(breakdownForStops(dayStops));
    const dayVolumeStr = volumeToStr(dayStops);
    const dayStatParts = [];
    if (dayKm > 0) dayStatParts.push(`${dayKm} km`);
    if (dayBreakdownStr) dayStatParts.push(`Est. fuel ${dayBreakdownStr}`);
    if (dayVolumeStr) dayStatParts.push(dayVolumeStr);
    if (dayStatParts.length) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#666')
        .text(dayStatParts.join('  ·  '));
    }

    doc.moveDown(0.6);

    // Divider
    doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
    doc.moveDown(0.4);

    // Stops
    for (const stop of dayStops) {
      const typeEmoji = {
        start: '🏁', overnight: '🌙', destination: '🏆', waypoint: '📍', fuel: '⛽',
      }[stop.type] || '📍';
      const stopName = stop.label || stop.name || '—';
      const km = stop.kmFromPrevious ? `${stop.kmFromPrevious} km` : '';
      const dur = stop.durationFromPrevious || '';
      const eta = arrivalsByStopId && arrivalsByStopId.get(stop.id);
      const at = eta && eta.arrival ? `arr ${eta.arrival}${eta.departure ? ` · dep ${eta.departure}` : ''}` : '';
      const meta = [at, km, dur].filter(Boolean).join(' · ');

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#222')
        .text(`${typeEmoji}  ${stopName}`, { continued: false });

      if (meta) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#888')
          .text(`     ${meta}`);
      }
      if (stop.highlights && stop.highlights.length) {
        doc
          .font('Helvetica-Oblique')
          .fontSize(9)
          .fillColor('#555')
          .text(`     ${stop.highlights.join(' · ')}`);
      }
      if (stop.type === 'overnight' || stop.type === 'destination') {
        const bookingUrl = bookingUrlForStop(stop, trip);
        if (bookingUrl) {
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor('#2a6dba')
            .text(`     🏨 Find a hotel: ${bookingUrl}`, { link: bookingUrl, underline: false });
        }
      }
      doc.moveDown(0.35);
    }
  }

  // ── Final page: Trip summary ────────────────────────────────────────────────
  doc.addPage();
  doc.rect(0, 0, pageWidth, 4).fill('#E76F51');

  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor('#111')
    .text('Trip Summary', margin, 28, { width: pageWidth - margin * 2 });

  doc.moveDown(0.5);
  doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
  doc.moveDown(0.5);

  const summaryRows = brandedSummaryRows(trip, fuelHelpers);

  const rows = [
    ['Total distance', summaryRows.totalKm > 0 ? `${summaryRows.totalKm.toLocaleString('en-US')} km` : '—'],
    ['Total days', summaryRows.totalDays > 0 ? `${summaryRows.totalDays}` : '—'],
    ['Stops', `${summaryRows.stopCount}`],
  ];
  if (summaryRows.fuelCostStr) rows.push(['Est. fuel cost', summaryRows.fuelCostStr]);
  if (summaryRows.fuelVolumeStr) {
    const vol = summaryRows.fillUpsStr
      ? `${summaryRows.fuelVolumeStr}  (${summaryRows.fillUpsStr})`
      : summaryRows.fuelVolumeStr;
    rows.push(['Est. fuel volume', vol]);
  }
  if (Array.isArray(trip.countries) && trip.countries.length) {
    rows.push(['Countries', trip.countries.join('  ')]);
  }

  for (const [label, value] of rows) {
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#444')
      .text(label, margin, doc.y, { continued: true, width: 180 });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#111')
      .text(value);
    doc.moveDown(0.3);
  }

  // Category breakdown
  const catEntries = Object.entries(summaryRows.categoryCounts);
  if (catEntries.length) {
    doc.moveDown(0.5);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#333')
      .text('Stops by category');
    doc.moveDown(0.2);
    for (const [cat, count] of catEntries.sort((a, b) => b[1] - a[1])) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#555')
        .text(`  ${cat}  ×${count}`);
    }
  }

  // Pins summary
  if (pins.length) {
    doc.moveDown(0.5);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#333')
      .text(`Saved pins  (${pins.length})`);
    doc.moveDown(0.2);
    for (const pin of pins) {
      const cat = pin.category ? `[${pin.category}] ` : '';
      doc.font('Helvetica').fontSize(10).fillColor('#555').text(`  ${cat}${pin.name || ''}`);
      if (pin.notes) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#888').text(`    ${pin.notes}`);
      }
    }
  }

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#bbb')
    .text('Generated by Road Trip', margin, pageHeight - margin, { width: pageWidth - margin * 2, align: 'center' });
}

// ─── PDF export route ─────────────────────────────────────────────────────────

router.get('/api/trips/:id/export/pdf', limits.pdfExport, async (req, res) => {
  try {
    const db = getDb();
    const ref = await loadTripForAccess(req, res, false);
    if (!ref) return;

    const format = req.query.format === 'branded' ? 'branded' : 'plain';

    if (format === 'branded') {
      const userSnap = await db.collection('users').doc(req.uid).get();
      const user = userSnap.exists ? userSnap.data() : null;
      if (!user || user.plan !== 'pro') {
        return res.status(402).json({
          error: 'Branded PDF export is a Pro feature. Upgrade to Pro to unlock.',
          code: 'PRO_FEATURE_REQUIRED',
        });
      }
    }

    const snap = await ref.get();
    const trip = snap.data();
    const pinsSnap = await ref.collection('pins').orderBy('createdAt', 'asc').get();
    const pins = pinsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const fuel = await fuelModulePromise;
    // 'en-US' keeps the PDF's currency rendering deterministic regardless of
    // the server's runtime locale.
    const fuelHelpers = makeFuelHelpers(fuel, trip);
    // Arrival times from the same shared engine the app renders with
    // (issue #114) — keyed by stop id for the two PDF formatters.
    const { scheduleForStops } = await schedulePromise;
    const stops = Array.isArray(trip.stops) ? trip.stops : [];
    const schedule = scheduleForStops(stops, trip.driveStartTime);
    const arrivalsByStopId = new Map(stops.map((s, i) => [s.id, schedule[i]]));

    const filename = `${sanitizeFilename(trip.name)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 } });
    doc.pipe(res);

    if (format === 'branded') {
      const { brandedSummaryRows } = await pdfSummaryPromise;
      formatBranded(doc, trip, pins, fuelHelpers, brandedSummaryRows, arrivalsByStopId);
    } else {
      formatPlain(doc, trip, pins, fuelHelpers, arrivalsByStopId);
    }

    doc.end();
  } catch (e) {
    console.error('GET /api/trips/:id/export/pdf failed:', e);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.delete('/api/trips/:id/pins/:pinId', async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, true);
    if (!ref) return;
    const pinRef = ref.collection('pins').doc(req.params.pinId);
    const pinSnap = await pinRef.get();
    if (!pinSnap.exists) return res.status(404).json({ error: 'Pin not found', code: 'NOT_FOUND' });
    await pinRef.delete();
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/trips/:id/pins/:pinId failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.post('/api/trips/:id/share', async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    if (snap.data().ownerUid !== req.uid) {
      return res.status(403).json({ error: 'Owner only', code: 'FORBIDDEN' });
    }
    const shareToken = crypto.randomUUID();
    await ref.update({
      shareToken,
      isShared: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ shareToken, isShared: true });
  } catch (e) {
    console.error('POST /api/trips/:id/share failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.delete('/api/trips/:id/share', async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    if (snap.data().ownerUid !== req.uid) {
      return res.status(403).json({ error: 'Owner only', code: 'FORBIDDEN' });
    }
    await ref.update({
      shareToken: null,
      isShared: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/trips/:id/share failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

const TEMPLATE_MIN_STOPS = 3;
const TEMPLATE_DESCRIPTION_MAX = 500;
const TEMPLATE_TAGS_MAX = 8;
const TEMPLATE_TAG_LENGTH_MAX = 24;

function normaliseTemplateTags(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const clean = t.trim().toLowerCase().slice(0, TEMPLATE_TAG_LENGTH_MAX);
    if (!clean) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= TEMPLATE_TAGS_MAX) break;
  }
  return out;
}

router.post('/api/trips/:id/publish-template', async (req, res) => {
  try {
    const db = getDb();
    const userSnap = await db.collection('users').doc(req.uid).get();
    const user = userSnap.exists ? userSnap.data() : null;
    if (!user || user.plan !== 'pro') {
      return res.status(403).json({
        error: 'Publishing templates is a Pro feature.',
        code: 'PRO_REQUIRED',
      });
    }
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    const trip = snap.data();
    if (trip.ownerUid !== req.uid) {
      return res.status(403).json({ error: 'Owner only', code: 'FORBIDDEN' });
    }
    const stopCount = Array.isArray(trip.stops) ? trip.stops.length : 0;
    if (stopCount < TEMPLATE_MIN_STOPS) {
      return res.status(400).json({
        error: `Templates need at least ${TEMPLATE_MIN_STOPS} stops. This trip has ${stopCount}.`,
        code: 'TEMPLATE_TOO_FEW_STOPS',
      });
    }
    const body = req.body || {};
    const description = typeof body.templateDescription === 'string'
      ? body.templateDescription.trim().slice(0, TEMPLATE_DESCRIPTION_MAX)
      : '';
    const tags = normaliseTemplateTags(body.templateTags);
    const rawVisibility = body.templateVisibility;
    const templateVisibility = rawVisibility === 'unlisted' ? 'unlisted' : 'public';
    const update = {
      isTemplate: true,
      templateDescription: description,
      templateTags: tags,
      templateVisibility,
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Initialise cloneCount only on first publish — re-publishing
    // shouldn't reset the score the template has already earned.
    if (typeof trip.cloneCount !== 'number') update.cloneCount = 0;
    await ref.update(update);
    res.json({ ok: true, isTemplate: true });
  } catch (e) {
    console.error('POST /api/trips/:id/publish-template failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.delete('/api/trips/:id/publish-template', async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    if (snap.data().ownerUid !== req.uid) {
      return res.status(403).json({ error: 'Owner only', code: 'FORBIDDEN' });
    }
    // Soft retract — keep templateDescription/templateTags/cloneCount so
    // re-publishing later preserves the metadata.
    await ref.update({
      isTemplate: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true, isTemplate: false });
  } catch (e) {
    console.error('DELETE /api/trips/:id/publish-template failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

const COLLABORATOR_LIMIT_FREE = 1;

// POST /api/trips/:id/collaborators — owner-only, adds a collaborator by email.
// Resolves email → uid via the Admin SDK; 404 when not a known user. Free tier
// capped at COLLABORATOR_LIMIT_FREE collaborator per trip.
router.post('/api/trips/:id/collaborators', limits.collaboratorAdd, async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    const data = snap.data();
    if (data.ownerUid !== req.uid) return res.status(403).json({ error: 'Owner only', code: 'FORBIDDEN' });

    const email = ((req.body || {}).email || '').toString().trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email required', code: 'INVALID' });

    let collaboratorUid;
    try {
      const u = await getAuth().getUserByEmail(email);
      collaboratorUid = u.uid;
    } catch {
      return res.status(404).json({ error: 'No such user', code: 'NOT_FOUND' });
    }

    if (collaboratorUid === req.uid) {
      return res.status(400).json({ error: 'You are already the owner', code: 'INVALID' });
    }

    const existing = Array.isArray(data.collaborators) ? data.collaborators : [];
    if (existing.includes(collaboratorUid)) {
      return res.status(409).json({ error: 'Already a collaborator', code: 'ALREADY_EXISTS' });
    }

    const userSnap = await db.collection('users').doc(req.uid).get();
    const user = userSnap.exists ? userSnap.data() : null;
    const isPro = user && user.plan === 'pro';
    if (!isPro && existing.length >= COLLABORATOR_LIMIT_FREE) {
      return res.status(402).json({
        error: `Free plan is capped at ${COLLABORATOR_LIMIT_FREE} collaborator${COLLABORATOR_LIMIT_FREE === 1 ? '' : 's'} per trip. Upgrade to Pro for unlimited collaborators.`,
        code: 'COLLABORATOR_LIMIT_REACHED',
        limit: COLLABORATOR_LIMIT_FREE,
      });
    }

    await ref.update({
      collaborators: [...existing, collaboratorUid],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ ok: true, uid: collaboratorUid });
  } catch (e) {
    console.error('POST /api/trips/:id/collaborators failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

// DELETE /api/trips/:id/collaborators/:uid — owner-only, removes a collaborator.
router.delete('/api/trips/:id/collaborators/:uid', async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    const data = snap.data();
    if (data.ownerUid !== req.uid) return res.status(403).json({ error: 'Owner only', code: 'FORBIDDEN' });

    const existing = Array.isArray(data.collaborators) ? data.collaborators : [];
    const next = existing.filter((u) => u !== req.params.uid);
    if (next.length === existing.length) {
      return res.status(404).json({ error: 'Collaborator not found', code: 'NOT_FOUND' });
    }

    await ref.update({
      collaborators: next,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/trips/:id/collaborators/:uid failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

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

router.post('/api/trips/:id/budget', limits.budgetCreate, async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, true);
    if (!ref) return;
    const { error, value } = validateBudgetPayload(req.body || {}, { partial: false });
    if (error) return res.status(400).json({ error, code: 'INVALID' });
    const newItem = {
      ...value,
      addedByUid: req.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const itemRef = await ref.collection('budget_items').add(newItem);
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

module.exports = router;
