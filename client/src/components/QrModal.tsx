import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useFocusTrap } from '../hooks/useFocusTrap';

type Props = {
  url: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
};

/** Modal showing a QR code for a URL — the killer in-car flow: laptop user
 * planned a trip, scans this with their phone camera, Maps app opens with
 * the route preloaded, taps Start, Android Auto picks it up. The QR is
 * rendered as SVG (sharper than canvas at any size), white-on-white card
 * for camera friendliness regardless of the surrounding dark theme. */
export function QrModal({ url, title, subtitle, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      window.prompt('Copy this URL:', url);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        ref={trapRef}
        className="bg-surface border border-line rounded-xl p-6 max-w-sm w-full shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif italic text-[20px] leading-tight text-paper truncate">{title}</h2>
            {subtitle && (
              <p className="text-paper-dim text-[12px] mt-1 leading-snug">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="bg-transparent border border-line text-paper-dim w-9 h-9 rounded text-base flex items-center justify-center hover:border-paper-dim hover:text-paper transition-colors shrink-0"
          >
            ×
          </button>
        </header>
        <div className="bg-white rounded-lg p-4 flex items-center justify-center mb-3">
          <QRCodeSVG value={url} size={224} level="M" />
        </div>
        <p className="text-center font-mono text-[10px] tracking-[0.18em] uppercase text-paper-muted mb-3">
          Scan with your phone camera
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 bg-canvas border border-line text-paper-dim text-[12px] px-2 py-1.5 rounded font-mono outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={copy}
            className="bg-accent text-canvas px-3 py-1.5 rounded font-mono text-[10px] tracking-[0.16em] uppercase hover:opacity-90 transition-opacity shrink-0"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
