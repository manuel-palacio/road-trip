import type { Stop } from './types';

/** GPX / KML → trip import (issue #116). Pure DOM parsing, no network:
 * the caller feeds file text in and gets ordered points out, then previews
 * and creates the trip through the normal POST /api/trips path. */

export type ImportedPoint = { name: string; lat: number; lng: number; notes?: string };
export type ParsedTripFile = { name: string | null; points: ImportedPoint[] };

/** Days cap at 10 stops for Android Auto; 25 keeps an imported route
 * editable while everything beyond it is offered as pins instead. */
export const MAX_IMPORT_STOPS = 25;

export function parseTripFile(text: string): ParsedTripFile {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('That file is not valid XML.');
  }
  const root = doc.documentElement.localName.toLowerCase();
  if (root === 'gpx') return parseGpx(doc);
  if (root === 'kml') return parseKml(doc);
  throw new Error('Unsupported file — expected a GPX or KML document.');
}

function parseGpx(doc: Document): ParsedTripFile {
  const name =
    textOf(doc.querySelector('metadata > name')) ||
    textOf(doc.querySelector('trk > name')) ||
    textOf(doc.querySelector('rte > name')) ||
    null;

  const waypoints = [...doc.querySelectorAll('wpt')];
  const routePoints = waypoints.length === 0 ? [...doc.querySelectorAll('rte rtept')] : [];
  const named = [...waypoints, ...routePoints]
    .map((el, i) => gpxPoint(el, `Stop ${i + 1}`))
    .filter(Boolean) as ImportedPoint[];
  if (named.length > 0) return { name, points: named };

  // Track-only file: dense geometry, no named places — keep the endpoints
  // so the route can be re-routed properly inside the app.
  const trackPoints = [...doc.querySelectorAll('trk trkpt')];
  if (trackPoints.length >= 2) {
    const first = gpxPoint(trackPoints[0], 'Start');
    const last = gpxPoint(trackPoints[trackPoints.length - 1], name || 'End');
    if (first && last) return { name, points: [first, last] };
  }
  throw new Error('No waypoints, route points, or track found in the GPX file.');
}

function gpxPoint(el: Element, fallbackName: string): ImportedPoint | null {
  const lat = parseFloat(el.getAttribute('lat') || '');
  const lng = parseFloat(el.getAttribute('lon') || '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const notes = textOf(el.querySelector('desc'));
  return {
    name: textOf(el.querySelector('name')) || fallbackName,
    lat,
    lng,
    ...(notes ? { notes } : {}),
  };
}

function parseKml(doc: Document): ParsedTripFile {
  const name = textOf(doc.querySelector('Document > name')) || null;
  const placemarks = [...doc.querySelectorAll('Placemark')];

  const points: ImportedPoint[] = [];
  for (const pm of placemarks) {
    const coords = textOf(pm.querySelector('Point > coordinates'));
    if (!coords) continue;
    const point = kmlCoordinate(coords, textOf(pm.querySelector('name')) || `Stop ${points.length + 1}`);
    if (!point) continue;
    const notes = textOf(pm.querySelector('description'));
    points.push(notes ? { ...point, notes } : point);
  }
  if (points.length > 0) return { name, points };

  // Point-less KML: fall back to the first LineString's endpoints.
  for (const pm of placemarks) {
    const coords = textOf(pm.querySelector('LineString > coordinates'));
    if (!coords) continue;
    const pairs = coords.split(/\s+/).filter(Boolean);
    if (pairs.length < 2) continue;
    const first = kmlCoordinate(pairs[0], 'Start');
    const last = kmlCoordinate(pairs[pairs.length - 1], textOf(pm.querySelector('name')) || 'End');
    if (first && last) return { name, points: [first, last] };
  }
  throw new Error('No points found in the KML file.');
}

function kmlCoordinate(raw: string, name: string): ImportedPoint | null {
  const [lng, lat] = raw.trim().split(',').map(parseFloat);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { name, lat, lng };
}

function textOf(el: Element | null): string {
  return (el?.textContent || '').trim();
}

/** Map ordered points onto the app's stop shape: first = start, last =
 * destination, middle = waypoints. Points beyond the cap come back as
 * `extras` for the caller to offer as pins. */
export function importedPointsToStops(
  points: ImportedPoint[],
  max: number = MAX_IMPORT_STOPS,
): { stops: Stop[]; extras: ImportedPoint[] } {
  const kept = points.slice(0, max);
  const extras = points.slice(max);
  const stops = kept.map((p, i) => ({
    id: crypto.randomUUID(),
    name: p.name,
    label: p.name,
    lat: p.lat,
    lng: p.lng,
    type: i === 0 ? 'start' : i === kept.length - 1 ? 'destination' : 'waypoint',
    highlights: [],
    kmFromPrevious: 0,
    ...(p.notes ? { notes: p.notes.slice(0, 500) } : {}),
  })) as Stop[];
  return { stops, extras };
}
