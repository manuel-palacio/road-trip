import { describe, expect, it } from 'vitest';
import { findBestInsertIndex, pinToStop, reassignStopTypes, stopToPinDraft } from '../promote';
import type { Pin, Stop } from '../types';

const stop = (id: string, lat: number, lng: number, type: Stop['type'] = 'overnight'): Stop => ({
  id, name: id, label: id, lat, lng, type,
});

describe('findBestInsertIndex', () => {
  it('returns 0 for an empty stop list', () => {
    expect(findBestInsertIndex([], 49.25, 4.03)).toBe(0);
  });

  it('appends after the only stop', () => {
    expect(findBestInsertIndex([stop('a', 49.25, 4.03)], 50, 5)).toBe(1);
  });

  it('inserts between two stops when the new point is on the line between them', () => {
    // A at (49,4), B at (45,5). Point at (47, 4.5) sits between.
    const stops = [stop('a', 49, 4), stop('b', 45, 5)];
    expect(findBestInsertIndex(stops, 47, 4.5)).toBe(1);
  });

  it('appends at the end when the new point extends past the last stop', () => {
    // A→B going south. Point further south.
    const stops = [stop('a', 49, 4), stop('b', 45, 5)];
    expect(findBestInsertIndex(stops, 43, 5.2)).toBe(2);
  });

  it('prepends at the start when the new point sits before the first stop', () => {
    const stops = [stop('a', 49, 4), stop('b', 45, 5)];
    expect(findBestInsertIndex(stops, 51, 3.5)).toBe(0);
  });

  it('inserts in the right segment of a 3-stop route', () => {
    // Reims → Lyon → Marseille (roughly N→S in France)
    const stops = [
      stop('reims', 49.2583, 4.0317),
      stop('lyon', 45.764, 4.8357),
      stop('marseille', 43.2965, 5.3698),
    ];
    // Avignon (43.95, 4.81) sits between Lyon and Marseille
    expect(findBestInsertIndex(stops, 43.95, 4.81)).toBe(2);
  });
});

describe('reassignStopTypes', () => {
  it('marks the first stop as start and last as destination', () => {
    const stops = [
      stop('a', 49, 4, 'waypoint'),
      stop('b', 47, 4),
      stop('c', 45, 5, 'waypoint'),
    ];
    const out = reassignStopTypes(stops);
    expect(out[0].type).toBe('start');
    expect(out[1].type).toBe('overnight');
    expect(out[2].type).toBe('destination');
  });

  it('preserves explicit waypoint type for middle stops', () => {
    const stops = [stop('a', 49, 4), stop('b', 47, 4, 'waypoint'), stop('c', 45, 5)];
    expect(reassignStopTypes(stops)[1].type).toBe('waypoint');
  });

  it('preserves fuel type for middle stops', () => {
    const stops = [stop('a', 49, 4), stop('b', 47, 4, 'fuel'), stop('c', 45, 5)];
    expect(reassignStopTypes(stops)[1].type).toBe('fuel');
  });

  it('handles a single stop (becomes start, even if alone)', () => {
    expect(reassignStopTypes([stop('only', 49, 4)])[0].type).toBe('start');
  });
});

describe('pinToStop / stopToPinDraft', () => {
  const samplePin: Pin = {
    id: 'p1',
    name: 'Hilton Reims',
    category: 'hotel',
    priority: 'must',
    notes: '4-star, breakfast included',
    lat: 49.25,
    lng: 4.04,
  };

  it('promotes a pin into a waypoint stop carrying category/priority/notes', () => {
    const s = pinToStop(samplePin);
    expect(s.name).toBe('Hilton Reims');
    expect(s.label).toBe('Hilton Reims');
    expect(s.lat).toBe(49.25);
    expect(s.lng).toBe(4.04);
    expect(s.type).toBe('waypoint');
    expect(s.category).toBe('hotel');
    expect(s.priority).toBe('must');
    expect(s.notes).toBe('4-star, breakfast included');
    expect(s.id).not.toBe(samplePin.id); // fresh stop id
  });

  it('demotes a stop back to a pin, preserving promoted metadata', () => {
    const s = pinToStop(samplePin);
    const draft = stopToPinDraft(s);
    expect(draft.name).toBe('Hilton Reims');
    expect(draft.category).toBe('hotel');
    expect(draft.priority).toBe('must');
    expect(draft.notes).toBe('4-star, breakfast included');
    expect(draft.lat).toBe(49.25);
  });

  it('falls back to landmark/want when demoting a non-promoted stop', () => {
    const plain = stop('bare', 49, 4);
    const draft = stopToPinDraft(plain);
    expect(draft.category).toBe('landmark');
    expect(draft.priority).toBe('want');
  });

  it('demote folds highlights into notes when no notes exist', () => {
    const s: Stop = { ...stop('s', 49, 4), highlights: ['view', 'photo spot'] };
    expect(stopToPinDraft(s).notes).toBe('view · photo spot');
  });
});
