import { describe, expect, it } from 'vitest';
import { aaStatus, buildDayMapsUrl } from '../maps-deep-link';
import type { Stop } from '../types';

function s(id: string, lat: number, lng: number): Stop {
  return { id, name: id, label: id, lat, lng, type: 'waypoint' };
}

describe('aaStatus', () => {
  it('returns "ready" up to 8 stops', () => {
    expect(aaStatus(0)).toBe('ready');
    expect(aaStatus(8)).toBe('ready');
  });
  it('returns "limit" at 9 and 10 stops', () => {
    expect(aaStatus(9)).toBe('limit');
    expect(aaStatus(10)).toBe('limit');
  });
  it('returns "over" past 10 stops', () => {
    expect(aaStatus(11)).toBe('over');
    expect(aaStatus(20)).toBe('over');
  });
});

describe('buildDayMapsUrl', () => {
  it('returns null for empty', () => {
    expect(buildDayMapsUrl([])).toBeNull();
  });
  it('returns null for > 10 stops', () => {
    const stops = Array.from({ length: 11 }, (_, i) => s(String(i), 0, i));
    expect(buildDayMapsUrl(stops)).toBeNull();
  });
  it('single stop produces a destination-only URL', () => {
    const url = buildDayMapsUrl([s('a', 48.5, 7.7)]);
    expect(url).toContain('https://www.google.com/maps/dir/?api=1');
    expect(url).toContain('destination=');
    expect(url).not.toContain('origin=');
    expect(url).not.toContain('waypoints=');
  });
  it('two stops: origin + destination, no waypoints', () => {
    const url = buildDayMapsUrl([s('a', 48.5, 7.7), s('b', 49.0, 8.0)]);
    expect(url).toContain('origin=');
    expect(url).toContain('destination=');
    expect(url).not.toContain('waypoints=');
  });
  it('multi-stop: origin + waypoints + destination', () => {
    const stops = [s('a', 48.5, 7.7), s('b', 49.0, 8.0), s('c', 49.5, 8.5), s('d', 50.0, 9.0)];
    const url = buildDayMapsUrl(stops);
    expect(url).toContain('origin=');
    expect(url).toContain('destination=');
    expect(url).toContain('waypoints=');
    // Two waypoints (b and c) joined by | which gets URL-encoded
    expect(url).toContain('49%2C8%7C49.5%2C8.5');
  });
});
