import { useQuery } from '@tanstack/react-query';
import { getFxRates } from '../lib/api';

export function useFxRates(date: string | null | undefined) {
  return useQuery({
    queryKey: ['fx', date],
    queryFn: () => getFxRates(date!),
    enabled: !!date,
    staleTime: 24 * 60 * 60 * 1000, // rates for a given date don't change
  });
}
