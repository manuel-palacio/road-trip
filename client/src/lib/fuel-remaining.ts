export type FuelLevel = 'ok' | 'low' | 'empty';

export type FuelRemaining = {
  remainingKm: number;
  percent: number;
  level: FuelLevel;
};

/** How much range is left on the current tank (issue #125).
 *
 * The badge used to render distance *consumed* as a percentage of range,
 * which produced readings like "980/500 km · 196%" — a fuel gauge that
 * counts up past full. This reports what's left instead, clamped to
 * 0–100 so it always reads like a gauge.
 *
 * @param kmSinceLastFill distance driven since the last refuel event
 * @param tankRangeKm range on a full tank; null/0 means "not configured"
 */
export function fuelRemaining(
  kmSinceLastFill: number,
  tankRangeKm: number | null | undefined,
): FuelRemaining | null {
  if (!tankRangeKm || !Number.isFinite(tankRangeKm) || tankRangeKm <= 0) return null;
  const used = Math.max(0, kmSinceLastFill || 0);
  const remainingKm = Math.max(0, Math.round(tankRangeKm - used));
  const percent = Math.max(0, Math.min(100, Math.round((remainingKm / tankRangeKm) * 100)));
  const level: FuelLevel = percent <= 10 ? 'empty' : percent <= 30 ? 'low' : 'ok';
  return { remainingKm, percent, level };
}
