// Time-of-day schedule derivation (issue #114). Lives in shared/ so the PDF
// export endpoint renders the same arrival times as the app — same contract
// as shared/fuel.js.
//
// The clock is opt-in: without a valid trip.driveStartTime ("HH:MM") every
// entry is null and the UI shows nothing.

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MINUTES_PER_DAY = 24 * 60;

export function parseClockTime(raw) {
  if (typeof raw !== 'string') return null;
  const m = TIME_RE.exec(raw.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatClockTime(totalMinutes) {
  const wrapped = ((Math.round(totalMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = String(Math.floor(wrapped / 60)).padStart(2, '0');
  const m = String(wrapped % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** Per-stop arrival/departure clock times, parallel to `stops`.
 *
 * Each day starts at `driveStartTime` from the previous day's last stop.
 * arrival = previous departure + leg duration; departure = arrival +
 * stayMinutes. The trip start and each day's first departure show only a
 * departure; each day's last stop shows only an arrival (its departure is
 * the next morning's drive start).
 *
 * @param {Array} stops - stops with dayNumber applied (see applyDays)
 * @param {string|null|undefined} driveStartTime - "HH:MM" or unset
 * @returns {Array<{arrival: string|null, departure: string|null}|null>}
 */
export function scheduleForStops(stops, driveStartTime) {
  const dayStart = parseClockTime(driveStartTime);
  if (dayStart === null || stops.length === 0) return stops.map(() => null);

  const out = [];
  let clock = dayStart;
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const isFirst = i === 0;
    const newDay = !isFirst && (stop.dayNumber || 1) !== (stops[i - 1].dayNumber || 1);
    if (newDay) clock = dayStart;
    if (isFirst) {
      out.push({ arrival: null, departure: formatClockTime(clock) });
      continue;
    }
    clock += (stop.durationSecondsFromPrevious || 0) / 60;
    const arrival = formatClockTime(clock);
    const lastOfDay =
      i === stops.length - 1 || (stops[i + 1].dayNumber || 1) !== (stop.dayNumber || 1);
    if (lastOfDay) {
      out.push({ arrival, departure: null });
      continue;
    }
    const stay = stop.stayMinutes || 0;
    clock += stay;
    // Zero-stay departure equals arrival — showing both is noise.
    out.push({ arrival, departure: stay > 0 ? formatClockTime(clock) : null });
  }
  return out;
}
