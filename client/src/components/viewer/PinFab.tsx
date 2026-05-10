type Props = {
  active: boolean;
  onToggle: () => void;
};

export function PinFab({ active, onToggle }: Props) {
  return (
    <button
      type="button"
      aria-label={active ? 'Cancel adding pin' : 'Add a pin to the map'}
      title={active ? 'Cancel · Esc' : 'Add a pin'}
      onClick={onToggle}
      className={`absolute bottom-6 right-6 z-[10] w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ease-out-soft shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)] ${
        active
          ? 'bg-canvas border-2 border-accent text-accent'
          : 'bg-accent text-canvas border-2 border-accent hover:-translate-y-px hover:shadow-[0_14px_36px_-6px_rgba(231,111,81,0.55)]'
      }`}
    >
      <span className={`text-[22px] leading-none font-light transition-transform duration-200 ${active ? 'rotate-45' : ''}`}>
        +
      </span>
    </button>
  );
}
