import { useEffect, useRef, useState } from 'react';
import type { Pin, PinCategory, PinPriority } from '../../lib/types';
import { PIN_CATEGORIES, PIN_CATEGORY_META, PIN_PRIORITIES, PIN_PRIORITY_META } from '../../lib/pin-meta';

export type PinDraft = {
  name: string;
  category: PinCategory;
  priority: PinPriority;
  notes: string;
  lat: number;
  lng: number;
};

type Props = {
  initial?: Pin | null;
  lat: number;
  lng: number;
  defaultName?: string;
  defaultCategory?: PinCategory;
  defaultPriority?: PinPriority;
  defaultNotes?: string;
  // Which action is the primary (accent-styled) button. Defaults to 'pin'.
  // For hotels (search dispatch sets this to 'stop'), "Add as stop" becomes
  // the primary action since hotels are almost always navigation destinations.
  primaryAction?: 'pin' | 'stop';
  // Override the modal's header text and submit button label. Used when the
  // modal serves as the "Demote to pin" form (header = "Demote to pin",
  // submit = "Demote to pin"). Defaults derive from create/edit mode.
  headerLabel?: string;
  submitLabel?: string;
  saving?: boolean;
  onCancel: () => void;
  onSave: (draft: PinDraft) => void;
  // When provided, render a secondary "Add as stop" action that creates a
  // route stop from the same form data instead of saving as a pin. Only
  // shown in create mode (editing an existing pin doesn't make sense as a
  // stop conversion — use the Promote action for that).
  onSaveAsStop?: (draft: PinDraft) => void;
};

const ACCENT_BTN_CLS = 'bg-accent text-canvas border-0 rounded px-5 py-2.5 font-mono text-[11px] tracking-[0.16em] uppercase font-medium cursor-pointer transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-[0_6px_22px_-6px_rgba(231,111,81,0.5)] active:translate-y-0 disabled:bg-surface-2 disabled:text-paper-muted disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none';
const SECONDARY_BTN_CLS = 'bg-transparent border border-line-strong text-paper-dim rounded px-3.5 py-2.5 font-mono text-[11px] tracking-[0.16em] uppercase cursor-pointer transition-colors hover:border-paper hover:text-paper disabled:opacity-50 disabled:cursor-not-allowed';

export function PinModal({ initial, lat, lng, defaultName, defaultCategory, defaultPriority, defaultNotes, primaryAction, headerLabel, submitLabel, saving, onCancel, onSave, onSaveAsStop }: Props) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || defaultName || '');
  const [category, setCategory] = useState<PinCategory>(initial?.category || defaultCategory || 'landmark');
  const [priority, setPriority] = useState<PinPriority>(initial?.priority || defaultPriority || 'want');
  const [notes, setNotes] = useState(initial?.notes || defaultNotes || '');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), category, priority, notes: notes.trim(), lat, lng });
  }

  function saveAsStop() {
    if (!name.trim() || !onSaveAsStop) return;
    onSaveAsStop({ name: name.trim(), category, priority, notes: notes.trim(), lat, lng });
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-[400px] max-w-[calc(100vw-32px)] bg-surface border border-line-strong rounded-lg shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] animate-rise"
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line">
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted">
            {headerLabel ?? (isEdit ? 'Edit pin' : 'New pin')}
          </span>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="text-paper-muted hover:text-paper text-[18px] leading-none"
          >
            ×
          </button>
        </header>

        <div className="px-5 pt-4 pb-3 flex flex-col gap-5">
          <label className="block">
            <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">
              Name
            </span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              maxLength={80}
              placeholder="A short label…"
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-transparent border-0 border-b border-line text-paper font-serif italic text-[18px] leading-tight py-1 outline-none transition-colors focus:border-accent placeholder:text-paper-muted placeholder:italic"
            />
          </label>

          <div>
            <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-2">
              Category
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {PIN_CATEGORIES.map((cat) => {
                const meta = PIN_CATEGORY_META[cat];
                const selected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-md border transition-all duration-150 ${
                      selected
                        ? 'border-accent bg-accent-soft'
                        : 'border-line bg-canvas hover:border-paper-muted'
                    }`}
                  >
                    <span className="text-[18px] leading-none" style={{ filter: selected ? 'none' : 'saturate(0.85)' }}>
                      {meta.emoji}
                    </span>
                    <span className={`font-mono text-[9.5px] tracking-[0.18em] uppercase ${selected ? 'text-accent' : 'text-paper-dim'}`}>
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-2">
              Priority
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {PIN_PRIORITIES.map((p) => {
                const meta = PIN_PRIORITY_META[p];
                const selected = priority === p;
                const isMust = p === 'must';
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    title={meta.hint}
                    className={`flex flex-col items-center gap-0.5 py-2 rounded-md border transition-all duration-150 ${
                      selected
                        ? isMust
                          ? 'border-accent bg-accent-soft'
                          : 'border-paper-dim bg-[rgba(243,236,222,0.04)]'
                        : 'border-line bg-canvas hover:border-paper-muted'
                    }`}
                  >
                    <span className={`font-mono text-[10px] tracking-[0.18em] uppercase ${
                      selected
                        ? isMust ? 'text-accent' : 'text-paper'
                        : 'text-paper-dim'
                    }`}>
                      {meta.label}
                    </span>
                    <span className="font-serif italic text-[11px] text-paper-muted leading-none">
                      {meta.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">
              Notes
            </span>
            <textarea
              rows={2}
              value={notes}
              maxLength={500}
              placeholder="Optional details…"
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-transparent border-0 border-b border-line text-paper-dim font-serif italic text-[14px] py-1 outline-none resize-none min-h-[40px] transition-colors focus:border-accent placeholder:text-paper-muted placeholder:italic"
            />
          </label>
        </div>

        <footer className="border-t border-line px-5 py-3.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="bg-transparent border border-line text-paper-dim px-3.5 py-[7px] rounded text-[12px] tracking-wide transition-colors hover:border-paper-dim hover:text-paper"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {(() => {
              const showStopOption = !isEdit && !!onSaveAsStop;
              const stopIsPrimary = showStopOption && primaryAction === 'stop';
              const defaultSubmit = isEdit ? 'Save changes' : 'Drop pin';
              const computedSubmitLabel = saving ? 'Saving…' : (submitLabel ?? defaultSubmit);

              if (stopIsPrimary) {
                return (
                  <>
                    <button
                      type="submit"
                      disabled={saving || !name.trim()}
                      title="Just drop a pin (don't add to the route)"
                      className={SECONDARY_BTN_CLS}
                    >
                      {computedSubmitLabel}
                    </button>
                    <button
                      type="button"
                      onClick={saveAsStop}
                      disabled={saving || !name.trim()}
                      className={ACCENT_BTN_CLS}
                    >
                      {saving ? 'Saving…' : 'Add as stop'}
                    </button>
                  </>
                );
              }

              return (
                <>
                  {showStopOption && (
                    <button
                      type="button"
                      onClick={saveAsStop}
                      disabled={saving || !name.trim()}
                      title="Add this place to the route as a navigation stop instead of pinning it"
                      className={SECONDARY_BTN_CLS}
                    >
                      Add as stop
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saving || !name.trim()}
                    className={ACCENT_BTN_CLS}
                  >
                    {computedSubmitLabel}
                  </button>
                </>
              );
            })()}
          </div>
        </footer>
      </form>
    </div>
  );
}
