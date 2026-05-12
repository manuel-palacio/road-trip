const crypto = require('crypto');
const express = require('express');
const PDFDocument = require('pdfkit');
const { admin, getDb } = require('../lib/firebase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.use('/api/trips', authRequired);

const UPDATABLE_FIELDS = [
  'name',
  'description',
  'coverEmoji',
  'startDate',
  'maxKmPerDay',
  'stops',
  'totalKm',
  'totalDays',
  'countries',
];

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

router.post('/api/trips', async (req, res) => {
  try {
    const db = getDb();

    // Plan limit enforcement: free users are capped at FREE_TRIP_LIMIT.
    // Pro users (or anyone explicitly marked plan='pro') skip the check.
    const userSnap = await db.collection('users').doc(req.uid).get();
    const user = userSnap.exists ? userSnap.data() : null;
    if (!user || user.plan !== 'pro') {
      const limit = (user && typeof user.tripLimit === 'number')
        ? user.tripLimit
        : parseInt(process.env.FREE_TRIP_LIMIT || '2', 10);
      const countSnap = await db
        .collection('trips')
        .where('ownerUid', '==', req.uid)
        .count()
        .get();
      if (countSnap.data().count >= limit) {
        return res.status(402).json({
          error: `Free plan is capped at ${limit} trips. Upgrade to create more.`,
          code: 'TRIP_LIMIT_REACHED',
          limit,
        });
      }
    }

    const body = req.body || {};
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

router.put('/api/trips/:id', async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('trips').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Trip not found', code: 'NOT_FOUND' });
    if (!canWrite(snap.data(), req.uid)) return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });

    const body = req.body || {};
    const update = {};
    for (const key of UPDATABLE_FIELDS) {
      if (key in body) update[key] = body[key];
    }
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

router.post('/api/trips/:id/pins', async (req, res) => {
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
  const rtepts = stops
    .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
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

router.get('/api/trips/:id/export/pdf', async (req, res) => {
  try {
    const ref = await loadTripForAccess(req, res, false);
    if (!ref) return;
    const snap = await ref.get();
    const trip = snap.data();
    const pinsSnap = await ref.collection('pins').orderBy('createdAt', 'asc').get();
    const pins = pinsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const filename = `${sanitizeFilename(trip.name)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 } });
    doc.pipe(res);

    // Header
    doc
      .font('Times-Italic')
      .fontSize(28)
      .text(trip.name || 'Untitled trip', { align: 'left' });
    if (trip.description) {
      doc.moveDown(0.4).font('Times-Italic').fontSize(12).fillColor('#555').text(trip.description);
    }

    // Totals strip
    const totals = [];
    if (typeof trip.totalKm === 'number') totals.push(`${trip.totalKm.toLocaleString('en-US')} km`);
    if (typeof trip.totalDays === 'number') totals.push(`${trip.totalDays} day${trip.totalDays === 1 ? '' : 's'}`);
    if (Array.isArray(trip.countries) && trip.countries.length) totals.push(trip.countries.join(' '));
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
      doc
        .moveDown(1.1)
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#000')
        .text(`Day ${day}`, { continued: false });
      doc.moveDown(0.3);
      for (const stop of dayStops) {
        const km = stop.kmFromPrevious ? `${stop.kmFromPrevious} km` : '';
        const dur = stop.durationFromPrevious || '';
        const meta = [km, dur].filter(Boolean).join(' · ');
        doc.font('Helvetica').fontSize(11).fillColor('#000').text(stop.label || stop.name || '—', { continued: !!meta });
        if (meta) {
          doc.font('Helvetica').fontSize(9).fillColor('#666').text(`   ${meta}`);
        }
        if (stop.highlights && stop.highlights.length) {
          doc.font('Helvetica-Oblique').fontSize(10).fillColor('#444').text(`   ${stop.highlights.join(' · ')}`);
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

module.exports = router;
