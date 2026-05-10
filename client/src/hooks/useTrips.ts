import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteTrip, listTrips } from '../lib/api';

export function useTrips(enabled: boolean) {
  return useQuery({
    queryKey: ['trips'],
    queryFn: listTrips,
    enabled,
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTrip,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  });
}
