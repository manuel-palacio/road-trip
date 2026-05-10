import { useEffect, useRef, useState } from 'react';

const TRAVEL_EMOJIS = ['🚗','🚙','🛻','🏎️','🚐','🛵','🚲','⛺','🏕️','🏔️','🏖️','🏝️','🗺️','🧭','🌅','🌲','🛣️','⛰️','🌊','🐪'];

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
        <div className="absolute top-12 left-0 z-50 grid grid-cols-5 gap-1 p-2.5 bg-canvas border border-line-strong rounded-lg shadow-[0_16px_40px_-10px_rgba(0,0,0,0.6)]">
          {TRAVEL_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              title={emoji}
              onClick={() => { onChange(emoji); setOpen(false); }}
              className="bg-transparent border-0 text-[22px] w-9 h-9 rounded cursor-pointer transition-colors hover:bg-surface-2"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
