import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listFavorites, createFavorite, deleteFavorite } from '../lib/api';
import { favoriteKey } from '../lib/favorite-key';
import type { Favorite, Stop } from '../lib/types';

export function useFavorites() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['favorites'],
    queryFn: listFavorites,
    staleTime: 60_000,
  });

  const keysById = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of query.data || []) map.set(favoriteKey(f), f.id);
    return map;
  }, [query.data]);

  const add = useMutation({
    mutationFn: createFavorite,
    onSuccess: (saved) => {
      qc.setQueryData<Favorite[]>(['favorites'], (prev = []) => {
        if (prev.some(p => p.id === saved.id)) return prev;
        return [saved, ...prev];
      });
    },
  });

  const remove = useMutation({
    mutationFn: deleteFavorite,
    onSuccess: (_void, id) => {
      qc.setQueryData<Favorite[]>(['favorites'], (prev = []) => prev.filter(p => p.id !== id));
    },
  });

  function favoriteIdForStop(stop: Pick<Stop, 'lat' | 'lng' | 'name'> & { placeId?: string }): string | null {
    return keysById.get(favoriteKey({ name: stop.name, lat: stop.lat, lng: stop.lng, placeId: stop.placeId })) || null;
  }

  return {
    favorites: query.data || [],
    isLoading: query.isLoading,
    favoriteIdForStop,
    add: add.mutate,
    addAsync: add.mutateAsync,
    remove: remove.mutate,
    removeAsync: remove.mutateAsync,
    addPending: add.isPending,
    removePending: remove.isPending,
  };
}
