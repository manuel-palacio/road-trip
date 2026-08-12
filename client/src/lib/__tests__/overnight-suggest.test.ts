import { describe, expect, it } from 'vitest';
import { dayEndTarget, dayNeedsOvernightSuggestion } from '../overnight-suggest';
import type { DayGroup } from '../compute';
import type { Stop } from '../types';

function stop(id: string, type: Stop['type'], lat = 10, lng = 20): Stop {
  return { id, name: id, label: id, lat, lng, type } as Stop;
}

function group(day: number, entries: [Stop, number][]): DayGroup {
  return { day, stops: entries.map(([s, index]) => ({ stop: s, index })), km: 0, durationSeconds: 0 };
}

describe('dayNeedsOvernightSuggestion', () => {
  it('suggests when the day ends on a plain waypoint', () => {
    const g = group(1, [[stop('a', 'start'), 0], [stop('b', 'waypoint'), 1]]);
    expect(dayNeedsOvernightSuggestion(g)).toBe(true);
  });
  it('suggests when the day ends on a fuel pit-stop', () => {
    const g = group(1, [[stop('a', 'start'), 0], [stop('b', 'fuel'), 1]]);
    expect(dayNeedsOvernightSuggestion(g)).toBe(true);
  });
  it('stays quiet when the day already ends overnight or at the destination', () => {
    expect(dayNeedsOvernightSuggestion(group(1, [[stop('a', 'start'), 0], [stop('b', 'overnight'), 1]]))).toBe(false);
    expect(dayNeedsOvernightSuggestion(group(2, [[stop('c', 'waypoint'), 2], [stop('d', 'destination'), 3]]))).toBe(false);
  });
  it('stays quiet on empty days', () => {
    expect(dayNeedsOvernightSuggestion(group(1, []))).toBe(false);
  });
});

describe('dayEndTarget', () => {
  it('anchors the search at the day\'s last stop and inserts after it', () => {
    const last = stop('b', 'waypoint', 48.1, 11.5);
    const g = group(1, [[stop('a', 'start'), 4], [last, 7]]);
    const target = dayEndTarget(g);
    expect(target).not.toBeNull();
    expect(target!.midpoint).toEqual({ lat: 48.1, lng: 11.5 });
    expect(target!.insertAtFlatIndex).toBe(8);
    expect(target!.legKm).toBe(0);
  });
  it('returns null for empty days', () => {
    expect(dayEndTarget(group(1, []))).toBeNull();
  });
});
