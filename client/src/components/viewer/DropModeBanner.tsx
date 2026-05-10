type Props = {
  onCancel: () => void;
};

export function DropModeBanner({ onCancel }: Props) {
  return (
    <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[10] flex items-center gap-3 bg-canvas/90 backdrop-blur border border-accent rounded-full pl-4 pr-2 py-1.5 font-mono text-[10.5px] tracking-[0.18em] uppercase text-paper shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)] animate-rise">
      <span className="inline-flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        Click a place or anywhere on the map
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="bg-transparent border border-line text-paper-dim px-2.5 py-[3px] rounded-full text-[10px] tracking-[0.16em] hover:text-paper hover:border-paper-dim transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
