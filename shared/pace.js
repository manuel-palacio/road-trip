// Personal driving pace (issue #126). Routing APIs return an average
// driver's duration; real travellers are consistently quicker or slower,
// and over a multi-day trip that error compounds.
//
// `paceFactor` is a SPEED multiplier — 1.2 means "I drive 20% faster than
// average", so the leg takes 1/1.2 of the routed time. Lives in shared/ so
// the PDF export derives the same numbers as the app.
import { formatDuration } from './duration.js';

export const DEFAULT_PACE = 1;
export const MIN_PACE = 0.5;
export const MAX_PACE = 2;

/** True when the factor means "just use the routed average". */
export function isDefaultPace(paceFactor) {
  return !isUsablePace(paceFactor) || paceFactor === DEFAULT_PACE;
}

function isUsablePace(paceFactor) {
  return (
    typeof paceFactor === 'number' &&
    Number.isFinite(paceFactor) &&
    paceFactor >= MIN_PACE &&
    paceFactor <= MAX_PACE
  );
}

/** Scale each leg's driving duration by the traveller's pace.
 *
 * `baseDurationSeconds` carries the untouched routed value so callers can
 * persist raw durations and so re-applying pace works off the original
 * rather than compounding — `seedCacheFromPersistedPaths` re-seeds the
 * segment cache from saved durations, which would otherwise double-apply.
 *
 * Distance is untouched: driving faster doesn't shorten the road.
 * Pure — returns a new array. */
export function applyPace(stops, paceFactor) {
  if (isDefaultPace(paceFactor)) return stops;
  return stops.map((stop) => {
    const base = stop.baseDurationSeconds ?? stop.durationSecondsFromPrevious;
    if (!base) return stop;
    const adjusted = Math.round(base / paceFactor);
    return {
      ...stop,
      baseDurationSeconds: base,
      durationSecondsFromPrevious: adjusted,
      durationFromPrevious: formatDuration(adjusted),
    };
  });
}
