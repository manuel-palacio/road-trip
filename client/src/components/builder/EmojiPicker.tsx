import { useEffect, useRef, useState } from 'react';

const TRAVEL_EMOJIS = [
  '🚗','🚙','🛻','🏎️','🚐','🛵',
  '🚲','🏍️','🚌','🚎','🚂','🚢',
  '⛺','🏕️','🛖','🏔️','⛰️','🌋',
  '🏖️','🏝️','🌅','🌄','🌆','🌃',
  '🗺️','🧭','🛣️','🛤️','🌲','🌳',
  '🌊','🌴','🏰','🗿','🐪','🐎',
];

type Props = {
  value: string;
  onChange: (emoji: string) => void;
};

export function EmojiPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(ev: MouseEvent) {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Cover emoji"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`bg-transparent rounded-md w-11 h-11 text-[24px] cursor-pointer transition-colors duration-200 ease-out-soft border ${
          open ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent'
        }`}
      >
        {value || '🚗'}
      </button>
      {open && (
        <div className="absolute top-12 left-0 z-50 w-[300px] bg-canvas border border-line-strong rounded-lg shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)] animate-rise">
          <div className="px-3.5 pt-3 pb-2 border-b border-line flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted">
              Cover icon
            </span>
            <span className="font-serif italic text-[13px] text-paper-dim">{value || '🚗'}</span>
          </div>
          <div className="grid grid-cols-6 gap-1.5 p-3 max-h-[280px] overflow-y-auto">
            {TRAVEL_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                title={emoji}
                onClick={() => { onChange(emoji); setOpen(false); }}
                className={`bg-transparent border text-[22px] w-10 h-10 rounded cursor-pointer transition-all hover:bg-surface-2 hover:scale-110 ${
                  emoji === value ? 'border-accent bg-accent-soft' : 'border-transparent'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
