import { useQuery } from '@tanstack/react-query';
import { getMe } from '../lib/api';

export function useMe(enabled: boolean) {
  return useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}
