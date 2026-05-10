import { useEffect } from 'react';

type Props = {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
  variant?: 'accent' | 'success';
};

export function Toast({ message, onDismiss, durationMs = 4500, variant = 'accent' }: Props) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;
  const colorCls =
    variant === 'success'
      ? 'border-paper-dim text-paper'
      : 'border-accent text-accent';
  return (
    <div className={`fixed bottom-6 right-6 z-[200] bg-surface rounded-md px-4 py-2.5 font-mono text-[11px] tracking-wide max-w-[360px] shadow-[0_12px_30px_-8px_rgba(0,0,0,0.5)] border ${colorCls}`}>
      {message}
    </div>
  );
}
