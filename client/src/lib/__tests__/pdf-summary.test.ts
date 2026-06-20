import { describe, expect, it } from 'vitest';
import { brandedSummaryRows } from '@shared/pdf-summary.js';

// Minimal fuel helpers that exercise the pure helper without a real fuel module.
function makeFakeHelpers({
  fuelCost = null,
  fuelVolume = null,
  fillUps = null,
}: {
  fuelCost?: string | null;
  fuelVolume?: string | null;
  fillUps?: string | null;
} = {}) {
  return {
    breakdownForStops: () => ({}),
    breakdownToStr: () => fuelCost ?? '',
    volumeForStops: () => 0,
    volumeToStr: () => fuelVolume ?? '',
    fillUpsForStops: () => fillUps ?? '',
  };
}

describe('brandedSummaryRows', () => {
  it('returns zeros for an empty trip', () => {
    const result = brandedSummaryRows({ stops: [], totalKm: 0, totalDays: 0 }, makeFakeHelpers());
    expect(result.totalKm).toBe(0);
    expect(result.totalDays).toBe(0);
    expect(result.stopCount).toBe(0);
    expect(result.fuelCostStr).toBeNull();
    expect(result.fuelVolumeStr).toBeNull();
    expect(result.fillUpsStr).toBeNull();
    expect(result.categoryCounts).toEqual({});
  });

  it('sums totalKm and totalDays from the trip document', () => {
    const result = brandedSummaryRows(
      { stops: [], totalKm: 1200, totalDays: 5 },
      makeFakeHelpers(),
    );
    expect(result.totalKm).toBe(1200);
    expect(result.totalDays).toBe(5);
  });

  it('counts stops and builds category breakdown', () => {
    const stops = [
      { type: 'overnight', category: 'hotel' },
      { type: 'waypoint', category: 'scenic' },
      { type: 'waypoint', category: 'scenic' },
      { type: 'fuel' },
    ];
    const result = brandedSummaryRows({ stops, totalKm: 0, totalDays: 0 }, makeFakeHelpers());
    expect(result.stopCount).toBe(4);
    expect(result.categoryCounts).toEqual({ hotel: 1, scenic: 2, fuel: 1 });
  });

  it('falls back to type when category is absent', () => {
    const stops = [{ type: 'start' }, { type: 'destination' }];
    const result = brandedSummaryRows({ stops, totalKm: 0, totalDays: 0 }, makeFakeHelpers());
    expect(result.categoryCounts).toEqual({ start: 1, destination: 1 });
  });

  it('falls back to "other" when both type and category are absent', () => {
    const stops = [{}];
    const result = brandedSummaryRows({ stops, totalKm: 0, totalDays: 0 }, makeFakeHelpers());
    expect(result.categoryCounts).toEqual({ other: 1 });
  });

  it('exposes fuel cost string from the helper', () => {
    const result = brandedSummaryRows(
      { stops: [], totalKm: 0, totalDays: 0 },
      makeFakeHelpers({ fuelCost: '€120', fuelVolume: '45 L', fillUps: '1 fill-up' }),
    );
    expect(result.fuelCostStr).toBe('€120');
    expect(result.fuelVolumeStr).toBe('45 L');
    expect(result.fillUpsStr).toBe('1 fill-up');
  });

  it('treats missing totalKm/totalDays as 0', () => {
    const result = brandedSummaryRows({ stops: [] }, makeFakeHelpers());
    expect(result.totalKm).toBe(0);
    expect(result.totalDays).toBe(0);
  });
});
