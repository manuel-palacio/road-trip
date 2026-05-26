import { dayColor } from '../lib/compute';
import { DEFAULT_STOP_META, PIN_CATEGORY_META, stopCategory } from '../lib/pin-meta';
import type { Stop } from '../lib/types';

type Props = {
  stop: Stop;
  index: number;
  /** `card` is the builder StopRow size (~26px); `compact` is the viewer
   *  DayCard inline row size (~22px). */
  variant?: 'card' | 'compact';
};

export function StopIdentityBadge({ stop, index, variant = 'card' }: Props) {
  const category = stopCategory(stop);
  const meta = category ? PIN_CATEGORY_META[category] : DEFAULT_STOP_META;
  const ring = dayColor(stop.dayNumber);
  const seq = index + 1;

  const size = variant === 'compact' ? 22 : 26;
  const emojiSize = variant === 'compact' ? 13 : 15;
  const pipSize = variant === 'compact' ? 12 : 14;
  const pipFont = variant === 'compact' ? 9 : 10;

  return (
    <div
      data-testid="stop-identity-badge"
      className="relative shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        backgroundColor: meta.tint,
        border: `2px solid ${ring}`,
        boxSizing: 'border-box',
      }}
    >
      <span aria-hidden style={{ fontSize: emojiSize, lineHeight: 1 }}>{meta.emoji}</span>
      <span
        data-testid="stop-identity-badge-number"
        className="absolute font-mono font-semibold rounded-full flex items-center justify-center"
        style={{
          width: pipSize,
          height: pipSize,
          bottom: -3,
          right: -3,
          backgroundColor: ring,
          color: '#0d0e11',
          fontSize: pipFont,
          border: '1px solid #f3ecde',
          lineHeight: 1,
        }}
      >
        {seq}
      </span>
    </div>
  );
}
