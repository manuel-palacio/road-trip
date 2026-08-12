/** Gate for the Builder's hydrate-from-query effect. Hydration must run
 * exactly once per trip: the query data also changes on refetches and on the
 * post-save cache write, and re-hydrating then would overwrite edits the user
 * made while the request was in flight. */
export function shouldHydrateTrip(
  hydratedTripId: string | null,
  trip: { id: string } | undefined | null,
): boolean {
  if (!trip) return false;
  return trip.id !== hydratedTripId;
}
