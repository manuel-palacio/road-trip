import { useState, type ReactNode } from 'react';
import { useCreatePin, useDeletePin, useUpdatePin } from './usePins';
import { PinModal, type PinDraft } from '../components/viewer/PinModal';
import type { Pin, PinCategory, PinPriority, Stop } from '../lib/types';

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
  | { kind: 'edit'; pin: Pin }
  // Demote-from-stop: prefill the form from the stop's data; on save the
  // hook calls options.onDemoted(draft, stop). Header + submit label say
  // "Demote to pin" so the destructive intent is obvious.
  | { kind: 'demote'; stop: Stop };

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
  onSaveAsStop?: (draft: PinDraft) => void;
  // Called when the user confirms a demote-from-stop. Receives the edited
  // draft (so category/priority/notes the user filled in are preserved)
  // and the original stop. The caller is responsible for the actual
  // mutation (pin create + stop removal). Hook closes the modal after.
  onDemoted?: (draft: PinDraft, stop: Stop) => void;
};

export function usePinModal(tripId: string, options: Options = {}) {
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const createPin = useCreatePin(tripId);
  const updatePin = useUpdatePin(tripId);
  const deletePinM = useDeletePin(tripId);

  const openCreate = (input: CreateDraftInput) => setModal({ kind: 'create', ...input });
  const openEdit = (pin: Pin) => setModal({ kind: 'edit', pin });
  const openDemote = (stop: Stop) => setModal({ kind: 'demote', stop });
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

  function handleDemote(draft: PinDraft) {
    if (modal.kind !== 'demote') return;
    options.onDemoted?.(draft, modal.stop);
    closeModal();
  }

  let modalElement: ReactNode = null;
  if (modal.kind === 'create') {
    modalElement = (
      <PinModal
        lat={modal.lat}
        lng={modal.lng}
        defaultName={modal.defaultName}
        defaultCategory={modal.defaultCategory}
        defaultPriority={modal.defaultPriority}
        primaryAction={modal.primaryAction}
        saving={createPin.isPending}
        onCancel={closeModal}
        onSave={handleSave}
        onSaveAsStop={options.onSaveAsStop ? handleSaveAsStop : undefined}
      />
    );
  } else if (modal.kind === 'edit') {
    modalElement = (
      <PinModal
        initial={modal.pin}
        lat={modal.pin.lat}
        lng={modal.pin.lng}
        saving={updatePin.isPending}
        onCancel={closeModal}
        onSave={handleSave}
      />
    );
  } else if (modal.kind === 'demote') {
    const stop = modal.stop;
    modalElement = (
      <PinModal
        lat={stop.lat}
        lng={stop.lng}
        defaultName={stop.label || stop.name}
        defaultCategory={stop.category || 'landmark'}
        defaultPriority={stop.priority || 'want'}
        defaultNotes={stop.notes || (stop.highlights?.length ? stop.highlights.join(' · ') : '')}
        headerLabel="Demote to pin"
        submitLabel="Demote to pin"
        onCancel={closeModal}
        onSave={handleDemote}
      />
    );
  }

  return { openCreate, openEdit, openDemote, closeModal, deletePin, modalElement };
}
