type Props = {
  hero?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onUpgrade?: () => void;
};

export function NewTripTile({ hero = false, disabled = false, onClick, onUpgrade }: Props) {
  if (disabled) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-accent/55 bg-accent-soft text-center
          ${hero ? 'col-span-full min-h-[340px] py-[60px] px-[30px]' : 'min-h-[240px] p-[26px]'}`}
        role="region"
        aria-label="Free trip limit reached"
      >
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-accent">
          Free limit reached
        </div>
        <p className="font-serif italic text-[15px] leading-[1.45] text-paper-dim max-w-[230px]">
          Upgrade to Pro to keep building new road trips, export to PDF, and invite friends.
        </p>
        <button
          type="button"
          onClick={onUpgrade}
          className="mt-1 inline-flex items-center gap-2 bg-accent text-canvas border-0 rounded px-4 py-2 font-mono text-[10.5px] tracking-[0.18em] uppercase font-medium cursor-pointer transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-[0_8px_24px_-6px_rgba(231,111,81,0.5)]"
        >
          Upgrade to Pro <span aria-hidden>→</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-3.5 rounded-lg cursor-pointer
        bg-transparent border border-dashed border-line-strong text-inherit
        transition-all duration-200 ease-out-soft
        hover:border-accent hover:bg-accent-soft
        ${hero ? 'col-span-full min-h-[340px] py-[60px] px-[30px]' : 'min-h-[240px] p-[30px]'}`}
    >
      <div
        className={`font-serif italic font-normal text-accent leading-[0.6] ${hero ? 'text-[88px]' : 'text-[60px]'}`}
      >
        +
      </div>
      <div
        className="w-[60px] h-px route-mark opacity-65"
        aria-hidden
      />
      <div className="font-mono text-[10.5px] tracking-[0.22em] uppercase text-paper-dim transition-colors duration-200 hover:text-paper">
        Plot a new route
      </div>
    </button>
  );
}
