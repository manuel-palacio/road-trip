import { describe, expect, it } from 'vitest';
import { applyPace, isDefaultPace } from '../../../../shared/pace.js';
import type { Stop } from '../types';

function stop(id: string, durationSeconds?: number): Stop {
  return {
    id, name: id, label: id, lat: 0, lng: 0, type: 'waypoint',
    ...(durationSeconds === undefined ? {} : { durationSecondsFromPrevious: durationSeconds }),
  } as Stop;
}

const HOUR = 3600;

describe('applyPace', () => {
  it('shortens legs for a faster driver and lengthens them for a slower one', () => {
    const stops = [stop('a'), stop('b', HOUR)];
    expect(applyPace(stops, 1.2)[1].durationSecondsFromPrevious).toBe(3000); // 3600 / 1.2
    expect(applyPace(stops, 0.8)[1].durationSecondsFromPrevious).toBe(4500); // 3600 / 0.8
  });

  it('reformats the human-readable duration to match', () => {
    const out = applyPace([stop('a'), stop('b', 2 * HOUR)], 2);
    expect(out[1].durationFromPrevious).toBe('~1.0h');
  });

  it('keeps the untouched duration so saves stay raw and pace never compounds', () => {
    const once = applyPace([stop('a'), stop('b', HOUR)], 0.5);
    const twice = applyPace(once, 0.5);
    expect(once[1].baseDurationSeconds).toBe(HOUR);
    // Re-applying works off the base, so the result is stable rather than 4x.
    expect(twice[1].durationSecondsFromPrevious).toBe(7200);
    expect(twice[1].baseDurationSeconds).toBe(HOUR);
  });

  it('is a no-op for an unset, default or nonsensical factor', () => {
    const stops = [stop('a'), stop('b', HOUR)];
    for (const factor of [undefined, null, 1, 0, -2, NaN]) {
      expect(applyPace(stops, factor as number)[1].durationSecondsFromPrevious).toBe(HOUR);
    }
  });

  it('leaves distance and every other field alone', () => {
    const stops = [stop('a'), { ...stop('b', HOUR), kmFromPrevious: 120, label: 'Lyon' } as Stop];
    const out = applyPace(stops, 1.5);
    expect(out[1].kmFromPrevious).toBe(120);
    expect(out[1].label).toBe('Lyon');
  });
});

describe('isDefaultPace', () => {
  it('recognises the values that mean "just use the average"', () => {
    expect(isDefaultPace(undefined)).toBe(true);
    expect(isDefaultPace(null)).toBe(true);
    expect(isDefaultPace(1)).toBe(true);
    expect(isDefaultPace(1.1)).toBe(false);
  });
});
