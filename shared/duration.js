/** Human-readable driving duration. Lives in shared/ so pace, schedule and
 * the PDF export all format the same way (issue #126). */
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(seconds / 60)}m`;
  return `~${hours.toFixed(1)}h`;
}
