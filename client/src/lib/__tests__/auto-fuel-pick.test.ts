import { describe, expect, it } from 'vitest';
import { pickFuelStation } from '../auto-fuel-pick';
import type { FuelGap } from '../fuel-timeline';
import type { NearbyResult } from '../../components/builder/NearbyFinder';

const polyline = [
  { lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 2 },
  { lat: 0, lng: 3 }, { lat: 0, lng: 4 }, { lat: 0, lng: 5 },
];

const gap = (over: Partial<FuelGap> = {}): FuelGap => ({
  afterStopIndex: 0,
  beforeStopIndex: 5,
  gapKm: 600,
  legPolyline: polyline,
  ...over,
});

const station = (over: Partial<NearbyResult>): NearbyResult => ({
  placeId: over.placeId || Math.random().toString(),
  name: over.name || 'Station',
  vicinity: over.vicinity || '',
  rating: over.rating,
  lat: over.lat ?? 0,
  lng: over.lng ?? 0,
});

describe('pickFuelStation', () => {
  it('returns no-station when zero results pass the detour cap', async () => {
    const placesSearch = async () => [station({ lat: 1, lng: 2.5 })];
    const r = await pickFuelStation({ gap: gap(), tankRangeKm: 500, legStartRouteKm: 0, placesSearch, detourCapKm: 5 });
    expect(r).toEqual({ error: 'no-station' });
  });

  it('returns places-failed when placesSearch rejects', async () => {
    const placesSearch = async () => { throw new Error('quota'); };
    const r = await pickFuelStation({ gap: gap(), tankRangeKm: 500, legStartRouteKm: 0, placesSearch });
    expect(r).toEqual({ error: 'places-failed' });
  });

  it('picks the highest-rated of multiple in-cap candidates near target', async () => {
    const placesSearch = async () => [
      station({ placeId: 'A', lat: 0.005, lng: 3.6, rating: 3.0 }),
      station({ placeId: 'B', lat: 0.005, lng: 3.6, rating: 4.8 }),
      station({ placeId: 'C', lat: 0.005, lng: 3.6, rating: 4.0 }),
    ];
    const r = await pickFuelStation({ gap: gap(), tankRangeKm: 500, legStartRouteKm: 0, placesSearch, detourCapKm: 5 });
    expect('placeId' in r && r.placeId).toBe('B');
  });

  it('prefers a closer detour over a slightly higher rating', async () => {
    const placesSearch = async () => [
      station({ placeId: 'CLOSE', lat: 0.002, lng: 3.6, rating: 4.0 }),
      station({ placeId: 'FAR',   lat: 0.04,  lng: 3.6, rating: 4.4 }),
    ];
    const r = await pickFuelStation({ gap: gap(), tankRangeKm: 500, legStartRouteKm: 0, placesSearch, detourCapKm: 5 });
    expect('placeId' in r && r.placeId).toBe('CLOSE');
  });

  it('clamps target to the leg endpoint when the leg is shorter than the target km', async () => {
    const shortPolyline = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
    const placesSearch = async (loc: { lat: number; lng: number }) => {
      return [station({ placeId: 'END', lat: loc.lat, lng: loc.lng, rating: 4.0 })];
    };
    const r = await pickFuelStation({
      gap: { ...gap(), legPolyline: shortPolyline, beforeStopIndex: 1, gapKm: 600 },
      tankRangeKm: 500,
      legStartRouteKm: 0,
      placesSearch,
      detourCapKm: 5,
    });
    expect('placeId' in r && r.placeId).toBe('END');
  });
});
