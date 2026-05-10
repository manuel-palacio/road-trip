import { useState, type ReactNode } from 'react';
import { useCreatePin, useDeletePin, useUpdatePin } from './usePins';
import { PinModal, type PinDraft } from '../components/viewer/PinModal';
import type { Pin, PinCategory, PinPriority } from '../lib/types';

type ModalState =
  | { kind: 'closed' }
  | {
      kind: 'create';
      lat: number;
      lng: number;
      defaultName?: string;
      defaultCategory?: PinCategory;
      defaultPriority?: PinPriority;
      primaryAction?: 'pin' | 'stop';
    }
  | { kind: 'edit'; pin: Pin };

export type CreateDraftInput = {
  lat: number;
  lng: number;
  defaultName?: string;
  defaultCategory?: PinCategory;
  defaultPriority?: PinPriority;
  // 'stop' makes "Add as stop" the primary (accent) action and demotes
  // "Drop pin" to secondary. Used for hotels where the search result is
  // almost always a navigation destination, not just a highlight.
  primaryAction?: 'pin' | 'stop';
};

type Options = {
  onCreated?: () => void;
  // Optional alternative save path. When provided, the modal renders a
  // secondary "Add as stop" button. The callback receives the same draft
  // data; the hook closes the modal afterwards.
  onSaveAsStop?: (draft: import('../components/viewer/PinModal').PinDraft) => void;
};

export function usePinModal(tripId: string, options: Options = {}) {
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const createPin = useCreatePin(tripId);
  const updatePin = useUpdatePin(tripId);
  const deletePinM = useDeletePin(tripId);

  const openCreate = (input: CreateDraftInput) => setModal({ kind: 'create', ...input });
  const openEdit = (pin: Pin) => setModal({ kind: 'edit', pin });
  const closeModal = () => setModal({ kind: 'closed' });

  function deletePin(pin: Pin) {
    if (!window.confirm(`Delete pin "${pin.name}"?`)) return;
    deletePinM.mutate(pin.id);
  }

  function handleSave(draft: PinDraft) {
    if (modal.kind === 'edit') {
      updatePin.mutate({ pinId: modal.pin.id, body: draft }, { onSuccess: closeModal });
    } else if (modal.kind === 'create') {
      createPin.mutate(draft, {
        onSuccess: () => {
          closeModal();
          options.onCreated?.();
        },
      });
    }
  }

  function handleSaveAsStop(draft: PinDraft) {
    options.onSaveAsStop?.(draft);
    closeModal();
  }

  const modalElement: ReactNode =
    modal.kind !== 'closed' ? (
      <PinModal
        initial={modal.kind === 'edit' ? modal.pin : null}
        lat={modal.kind === 'edit' ? modal.pin.lat : modal.lat}
        lng={modal.kind === 'edit' ? modal.pin.lng : modal.lng}
        defaultName={modal.kind === 'create' ? modal.defaultName : undefined}
        defaultCategory={modal.kind === 'create' ? modal.defaultCategory : undefined}
        defaultPriority={modal.kind === 'create' ? modal.defaultPriority : undefined}
        primaryAction={modal.kind === 'create' ? modal.primaryAction : undefined}
        saving={createPin.isPending || updatePin.isPending}
        onCancel={closeModal}
        onSave={handleSave}
        onSaveAsStop={options.onSaveAsStop ? handleSaveAsStop : undefined}
      />
    ) : null;

  return { openCreate, openEdit, closeModal, deletePin, modalElement };
}
