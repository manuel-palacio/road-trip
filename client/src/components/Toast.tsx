import { useEffect } from 'react';

type Props = {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
  variant?: 'accent' | 'success' | 'auto-fuel';
  actionLabel?: string;
  onAction?: () => void;
};

export function Toast({
  message,
  onDismiss,
  durationMs = 4500,
  variant = 'accent',
  actionLabel,
  onAction,
}: Props) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  const colorCls =
    variant === 'success'
      ? 'border-paper-dim text-paper bg-surface'
      : variant === 'auto-fuel'
        ? 'border-line-strong text-paper-dim bg-canvas'
        : 'border-accent text-accent bg-surface';

  return (
    <div
      className={`fixed bottom-6 right-6 z-[200] rounded-md px-4 py-2.5 font-mono text-[11px] tracking-wide max-w-[360px] shadow-[0_12px_30px_-8px_rgba(0,0,0,0.5)] border flex items-center gap-3 ${colorCls}`}
    >
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center px-2 py-1 rounded border border-line-strong text-paper-dim hover:text-paper hover:border-paper-dim transition-colors font-mono text-[9px] tracking-[0.14em] uppercase whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
