import type { Pin } from '../../lib/types';
import { PIN_CATEGORY_META } from '../../lib/pin-meta';

type Props = {
  pins: Pin[];
  onEdit: (pin: Pin) => void;
  onDelete: (pin: Pin) => void;
  onFocus: (pin: Pin) => void;
};

export function PinList({ pins, onEdit, onDelete, onFocus }: Props) {
  if (pins.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted mb-3">
          No pins yet
        </div>
        <p className="font-serif italic text-[14px] text-paper-dim leading-relaxed">
          Hit the <span className="not-italic font-mono text-[11px] tracking-wider text-accent">+</span> button on the map and click anywhere to drop your first pin.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {pins.map((pin) => {
        const meta = PIN_CATEGORY_META[pin.category];
        const isMust = pin.priority === 'must';
        const ringColor = isMust ? '#e76f51' : meta.tint;
        return (
          <li
            key={pin.id}
            className={`group border rounded-lg px-3 py-2.5 transition-colors ${
              isMust
                ? 'border-[rgba(231,111,81,0.45)] bg-[rgba(231,111,81,0.06)] hover:border-accent'
                : 'border-line bg-surface hover:border-line-strong'
            }`}
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => onFocus(pin)}
                aria-label={`Show ${pin.name} on the map`}
                className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-canvas flex items-center justify-center text-[15px] leading-none border-2 transition-transform hover:scale-110"
                style={{ borderColor: ringColor }}
              >
                <span aria-hidden>{meta.emoji}</span>
              </button>
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => onFocus(pin)}
                  className="block w-full text-left text-[14px] text-paper truncate hover:text-accent transition-colors"
                >
                  {pin.name}
                </button>
                <div className="mt-0.5 font-mono text-[9.5px] tracking-[0.2em] uppercase text-paper-muted flex items-center gap-2 flex-wrap">
                  <span>{meta.label}</span>
                  {isMust && <span className="text-accent">· Must</span>}
                </div>
                {pin.notes && (
                  <p className="mt-1.5 font-serif italic text-[13px] text-paper-dim leading-snug [overflow-wrap:anywhere]">
                    {pin.notes}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onEdit(pin)}
                  aria-label={`Edit ${pin.name}`}
                  title="Edit"
                  className="w-7 h-7 rounded text-paper-muted hover:text-paper hover:bg-surface-2 text-[12px] leading-none flex items-center justify-center transition-colors"
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(pin)}
                  aria-label={`Delete ${pin.name}`}
                  title="Delete"
                  className="w-7 h-7 rounded text-paper-muted hover:text-accent hover:bg-surface-2 text-[14px] leading-none flex items-center justify-center transition-colors"
                >
                  ×
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
