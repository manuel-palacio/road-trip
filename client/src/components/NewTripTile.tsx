type Props = {
  hero?: boolean;
  onClick: () => void;
};

export function NewTripTile({ hero = false, onClick }: Props) {
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
