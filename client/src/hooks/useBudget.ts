import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBudgetItem,
  deleteBudgetItem,
  listBudget,
  updateBudgetItem,
} from '../lib/api';
import type { BudgetItem } from '../lib/types';

export function useBudget(tripId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['budget', tripId],
    queryFn: () => listBudget(tripId!),
    enabled: !!tripId,
    select: (data) => data.items,
  });

  const add = useMutation({
    mutationFn: (body: Omit<BudgetItem, 'id' | 'addedByUid' | 'createdAt' | 'updatedAt'>) =>
      createBudgetItem(tripId!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget', tripId] }),
  });

  const update = useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: Partial<BudgetItem> }) =>
      updateBudgetItem(tripId!, itemId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget', tripId] }),
  });

  const remove = useMutation({
    mutationFn: (itemId: string) => deleteBudgetItem(tripId!, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget', tripId] }),
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    add: add.mutate,
    update: update.mutate,
    remove: remove.mutate,
    addPending: add.isPending,
  };
}
