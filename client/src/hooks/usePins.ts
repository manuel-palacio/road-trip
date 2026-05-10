import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPin, deletePin, listPins, updatePin } from '../lib/api';
import type { Pin } from '../lib/types';

export function usePins(tripId: string | undefined) {
  return useQuery({
    queryKey: ['pins', tripId],
    queryFn: () => listPins(tripId!),
    enabled: !!tripId,
    select: (data) => data.pins,
  });
}

export function useCreatePin(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Pin, 'id' | 'addedByUid' | 'createdAt' | 'updatedAt'>) =>
      createPin(tripId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pins', tripId] }),
  });
}

export function useUpdatePin(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pinId, body }: { pinId: string; body: Partial<Pin> }) =>
      updatePin(tripId, pinId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pins', tripId] }),
  });
}

export function useDeletePin(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pinId: string) => deletePin(tripId, pinId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pins', tripId] }),
  });
}
