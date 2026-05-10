import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPin, deletePin, updateTrip } from '../lib/api';
import { findBestInsertIndex, pinToStop, reassignStopTypes, stopToPinDraft } from '../lib/promote';
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
      const nextStops = [...currentStops];
      nextStops.splice(insertAt, 0, newStop);
      const finalStops = reassignStopTypes(nextStops);
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
      const remaining = currentStops.filter((s) => s.id !== stop.id);
      const finalStops = reassignStopTypes(remaining);
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
