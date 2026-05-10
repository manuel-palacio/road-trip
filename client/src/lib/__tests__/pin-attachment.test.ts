import { describe, expect, it } from 'vitest';
import { computePinAttachments, haversineKm } from '../pin-attachment';
import type { Pin, Stop } from '../types';

const stop = (id: string, lat: number, lng: number): Stop => ({
  id, name: id, label: id, lat, lng, type: 'overnight',
});
const pin = (id: string, lat: number, lng: number): Pin => ({
  id, name: id, category: 'landmark', lat, lng,
});

// Reims city center: 49.2583, 4.0317
// Lyon: 45.764, 4.8357 (~370km from Reims)

describe('haversineKm', () => {
  it('returns ~0 for the same point', () => {
    expect(haversineKm({ lat: 49.25, lng: 4.03 }, { lat: 49.25, lng: 4.03 })).toBeLessThan(0.001);
  });

  it('approximates Reims → Lyon at ~370km', () => {
    const d = haversineKm({ lat: 49.2583, lng: 4.0317 }, { lat: 45.764, lng: 4.8357 });
    expect(d).toBeGreaterThan(360);
    expect(d).toBeLessThan(395);
  });
});

describe('computePinAttachments', () => {
  const reims = stop('reims', 49.2583, 4.0317);
  const lyon = stop('lyon', 45.764, 4.8357);

  it('attaches a pin within 5km to the nearest stop', () => {
    // 49.26, 4.04 is ~0.7km from Reims center
    const cathedralPin = pin('cathedral', 49.2533, 4.0344);
    const attachments = computePinAttachments([cathedralPin], [reims, lyon]);
    expect(attachments.get('cathedral')).toBe('reims');
  });

  it('does not attach a pin further than 5km from any stop', () => {
    // Halfway between Reims and Lyon (very far from both)
    const middlePin = pin('middle', 47.5, 4.4);
    const attachments = computePinAttachments([middlePin], [reims, lyon]);
    expect(attachments.get('middle')).toBeNull();
  });

  it('picks the closest stop when a pin is within range of multiple', () => {
    const closeToReims = stop('reims2', 49.27, 4.05); // ~2km from reims
    // Pin closer to reims2 than to reims
    const targetPin = pin('p', 49.272, 4.053);
    const attachments = computePinAttachments([targetPin], [reims, closeToReims]);
    expect(attachments.get('p')).toBe('reims2');
  });

  it('returns one entry per pin, even when no stops exist', () => {
    const p = pin('orphan', 50, 5);
    const attachments = computePinAttachments([p], []);
    expect(attachments.size).toBe(1);
    expect(attachments.get('orphan')).toBeNull();
  });
});
