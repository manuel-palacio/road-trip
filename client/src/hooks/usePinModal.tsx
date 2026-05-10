import { useState, type ReactNode } from 'react';
import { useCreatePin, useDeletePin, useUpdatePin } from './usePins';
import { PinModal, type PinDraft } from '../components/viewer/PinModal';
import type { Pin, PinCategory } from '../lib/types';

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create'; lat: number; lng: number; defaultName?: string; defaultCategory?: PinCategory }
  | { kind: 'edit'; pin: Pin };

export type CreateDraftInput = {
  lat: number;
  lng: number;
  defaultName?: string;
  defaultCategory?: PinCategory;
};

type Options = {
  onCreated?: () => void;
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

  const modalElement: ReactNode =
    modal.kind !== 'closed' ? (
      <PinModal
        initial={modal.kind === 'edit' ? modal.pin : null}
        lat={modal.kind === 'edit' ? modal.pin.lat : modal.lat}
        lng={modal.kind === 'edit' ? modal.pin.lng : modal.lng}
        defaultName={modal.kind === 'create' ? modal.defaultName : undefined}
        defaultCategory={modal.kind === 'create' ? modal.defaultCategory : undefined}
        saving={createPin.isPending || updatePin.isPending}
        onCancel={closeModal}
        onSave={handleSave}
      />
    ) : null;

  return { openCreate, openEdit, closeModal, deletePin, modalElement };
}
