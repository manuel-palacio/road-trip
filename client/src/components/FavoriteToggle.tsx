type Props = {
  isFavorited: boolean;
  pending?: boolean;
  onAdd: () => void;
  onRemove: () => void;
  size?: 'sm' | 'md';
};

export function FavoriteToggle({ isFavorited, pending, onAdd, onRemove, size = 'sm' }: Props) {
  const glyph = isFavorited ? '★' : '☆';
  const cls = size === 'md' ? 'text-[18px]' : 'text-[14px]';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (isFavorited) onRemove(); else onAdd(); }}
      disabled={pending}
      title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={isFavorited}
      className={`bg-transparent border-0 p-0.5 leading-none transition-colors cursor-pointer ${cls} ${isFavorited ? 'text-amber-400 hover:text-amber-300' : 'text-paper-muted hover:text-amber-400'} disabled:opacity-50`}
    >
      {glyph}
    </button>
  );
}
