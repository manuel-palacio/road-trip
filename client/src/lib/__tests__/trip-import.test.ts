import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_STOPS, importedPointsToStops, parseTripFile } from '../trip-import';

const GPX_WAYPOINTS = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Furkot" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Alps Loop</name></metadata>
  <wpt lat="45.899" lon="6.129"><name>Annecy</name><desc>Lakeside start</desc></wpt>
  <wpt lat="45.923" lon="6.869"><name>Chamonix</name></wpt>
  <wpt lat="45.737" lon="7.320"><name>Aosta</name></wpt>
</gpx>`;

const GPX_TRACK_ONLY = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Coastal drive</name><trkseg>
    <trkpt lat="43.296" lon="5.370"/>
    <trkpt lat="43.500" lon="6.000"/>
    <trkpt lat="43.696" lon="7.266"/>
  </trkseg></trk>
</gpx>`;

const KML_POINTS = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <name>Pyrenees run</name>
  <Placemark><name>Toulouse</name><description>Depart early</description>
    <Point><coordinates>1.444,43.604,0</coordinates></Point></Placemark>
  <Placemark><name>Andorra</name>
    <Point><coordinates>1.521,42.506</coordinates></Point></Placemark>
</Document></kml>`;

const KML_LINESTRING = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>Route</name><LineString><coordinates>
    2.35,48.85,0 4.83,45.76,0 5.37,43.29,0
  </coordinates></LineString></Placemark>
</Document></kml>`;

describe('parseTripFile', () => {
  it('parses GPX waypoints in file order with names, coords and notes', () => {
    const parsed = parseTripFile(GPX_WAYPOINTS);
    expect(parsed.name).toBe('Alps Loop');
    expect(parsed.points).toEqual([
      { name: 'Annecy', lat: 45.899, lng: 6.129, notes: 'Lakeside start' },
      { name: 'Chamonix', lat: 45.923, lng: 6.869 },
      { name: 'Aosta', lat: 45.737, lng: 7.32 },
    ]);
  });

  it('falls back to track endpoints for waypoint-less GPX', () => {
    const parsed = parseTripFile(GPX_TRACK_ONLY);
    expect(parsed.name).toBe('Coastal drive');
    expect(parsed.points).toHaveLength(2);
    expect(parsed.points[0]).toMatchObject({ lat: 43.296, lng: 5.37 });
    expect(parsed.points[1]).toMatchObject({ lat: 43.696, lng: 7.266 });
  });

  it('parses KML Point placemarks — coordinates are lng,lat', () => {
    const parsed = parseTripFile(KML_POINTS);
    expect(parsed.name).toBe('Pyrenees run');
    expect(parsed.points).toEqual([
      { name: 'Toulouse', lat: 43.604, lng: 1.444, notes: 'Depart early' },
      { name: 'Andorra', lat: 42.506, lng: 1.521 },
    ]);
  });

  it('falls back to LineString endpoints for point-less KML', () => {
    const parsed = parseTripFile(KML_LINESTRING);
    expect(parsed.points).toHaveLength(2);
    expect(parsed.points[0]).toMatchObject({ lat: 48.85, lng: 2.35 });
    expect(parsed.points[1]).toMatchObject({ lat: 43.29, lng: 5.37 });
  });

  it('throws on malformed XML, unsupported roots, and files with no usable points', () => {
    expect(() => parseTripFile('not xml at all <<<')).toThrow();
    expect(() => parseTripFile('<svg xmlns="http://www.w3.org/2000/svg"/>')).toThrow(/GPX or KML/i);
    expect(() => parseTripFile('<gpx xmlns="http://www.topografix.com/GPX/1/1"></gpx>')).toThrow(/no .*(waypoint|point)/i);
  });
});

describe('importedPointsToStops', () => {
  const mkPoints = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `P${i}`, lat: i, lng: i }));

  it('types the first stop start, the last destination, the middle waypoints', () => {
    const { stops, extras } = importedPointsToStops(mkPoints(4));
    expect(stops.map((s) => s.type)).toEqual(['start', 'waypoint', 'waypoint', 'destination']);
    expect(stops.map((s) => s.name)).toEqual(['P0', 'P1', 'P2', 'P3']);
    expect(extras).toEqual([]);
  });

  it('caps stops at MAX_IMPORT_STOPS and returns the remainder as extras', () => {
    const { stops, extras } = importedPointsToStops(mkPoints(30));
    expect(stops).toHaveLength(MAX_IMPORT_STOPS);
    expect(stops[MAX_IMPORT_STOPS - 1].type).toBe('destination');
    expect(extras).toHaveLength(30 - MAX_IMPORT_STOPS);
    expect(extras[0].name).toBe(`P${MAX_IMPORT_STOPS}`);
  });

  it('carries point notes onto the stop', () => {
    const { stops } = importedPointsToStops([
      { name: 'A', lat: 1, lng: 2, notes: 'hi' },
      { name: 'B', lat: 3, lng: 4 },
    ]);
    expect(stops[0].notes).toBe('hi');
    expect(stops[1].notes).toBeUndefined();
  });
});
