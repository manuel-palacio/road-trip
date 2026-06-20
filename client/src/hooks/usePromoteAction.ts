import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPin, deletePin, updateTrip } from '../lib/api';
import { findBestInsertIndex, pinToStop, reassignStopTypes, stopToPinDraft } from '../lib/promote';
import { removeStopById, spliceStopAt } from '../lib/stop-ops';
import type { Pin, Stop } from '../lib/types';

/**
 * Promote: insert the pin into the trip's stops array (cheapest position),
 * reassign types, save the trip, then delete the pin. Two writes — accept
 * eventual consistency. If the second call fails, the user sees both a
 * stop and a pin (annoying but recoverable; they can delete the pin).
 */
export function usePromotePin(tripId: string, currentStops: readonly Stop[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pin: Pin) => {
      const newStop = pinToStop(pin);
      const insertAt = findBestInsertIndex(currentStops, pin.lat, pin.lng);
      // spliceStopAt clears the successor's persisted km/duration/routePath —
      // its inbound leg changed, so the old values must not reach Firestore.
      const finalStops = reassignStopTypes(spliceStopAt(currentStops, insertAt, newStop));
      await updateTrip(tripId, { stops: finalStops });
      await deletePin(tripId, pin.id);
      return { tripId, pinId: pin.id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trip', tripId] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      qc.invalidateQueries({ queryKey: ['pins', tripId] });
    },
  });
}

/**
 * Demote: create a pin from the stop's data, save the trip with the stop
 * removed (and types reassigned). Two writes, same trade-off as promote.
 *
 * The mutation accepts either just a stop (pin draft is auto-derived from
 * the stop's data via stopToPinDraft) or a stop + a custom draft (used when
 * the user edits category/priority/notes in the demote modal before
 * confirming).
 */
type DemoteInput =
  | Stop
  | { stop: Stop; draft: ReturnType<typeof stopToPinDraft> };

export function useDemoteStop(tripId: string, currentStops: readonly Stop[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DemoteInput) => {
      const stop = 'stop' in input ? input.stop : input;
      const draft = 'draft' in input ? input.draft : stopToPinDraft(stop);
      await createPin(tripId, draft);
      // removeStopById clears the stale inbound leg of the stop that now
      // occupies the removed slot (its predecessor changed).
      const finalStops = reassignStopTypes(removeStopById(currentStops, stop.id));
      await updateTrip(tripId, { stops: finalStops });
      return { tripId, stopId: stop.id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trip', tripId] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      qc.invalidateQueries({ queryKey: ['pins', tripId] });
    },
  });
}
