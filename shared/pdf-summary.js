// Pure helper for computing branded PDF summary data without touching pdfkit.
// Loaded by routes/trips.js via dynamic import; tested directly in Vitest.

/**
 * Computes summary statistics for the branded PDF final page.
 *
 * @param {object} trip - Trip document from Firestore.
 * @param {object} fuelHelpers - Result of makeFuelHelpers() in routes/trips.js.
 * @returns {{ totalKm, totalDays, stopCount, fuelCostStr, fuelVolumeStr, fillUpsStr, categoryCounts }}
 */
export function brandedSummaryRows(trip, fuelHelpers) {
  const { breakdownForStops, breakdownToStr, volumeToStr, fillUpsForStops } = fuelHelpers;
  const stops = Array.isArray(trip.stops) ? trip.stops : [];

  const totalKm = typeof trip.totalKm === 'number' ? trip.totalKm : 0;
  const totalDays = typeof trip.totalDays === 'number' ? trip.totalDays : 0;
  const stopCount = stops.length;

  const fuelCostStr = breakdownToStr(breakdownForStops(stops)) || null;
  const fuelVolumeStr = volumeToStr(stops) || null;
  const fillUpsStr = fillUpsForStops(stops) || null;

  const categoryCounts = {};
  for (const s of stops) {
    const cat = s.category || s.type || 'other';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  return { totalKm, totalDays, stopCount, fuelCostStr, fuelVolumeStr, fillUpsStr, categoryCounts };
}
