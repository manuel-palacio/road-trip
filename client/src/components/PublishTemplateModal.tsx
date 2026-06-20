import { useEffect, useState } from 'react';
import type { Trip } from '../lib/types';

type Props = {
  trip: Trip;
  isPro: boolean;
  busy: boolean;
  errorMessage: string | null;
  onPublish: (input: { templateDescription: string; templateTags: string[]; templateVisibility: 'public' | 'unlisted' }) => void;
  onUnpublish: () => void;
  onClose: () => void;
};

const TAG_LIMIT = 8;

/** Modal for publishing/unpublishing a trip as a community template.
 * Lets the owner set a description + tags; shows current clone count
 * when already published, and an upgrade prompt for free users. */
export function PublishTemplateModal({
  trip,
  isPro,
  busy,
  errorMessage,
  onPublish,
  onUnpublish,
  onClose,
}: Props) {
  const [description, setDescription] = useState(trip.templateDescription || '');
  const [tagDraft, setTagDraft] = useState('');
  const [tags, setTags] = useState<string[]>(trip.templateTags || []);
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>(trip.templateVisibility || 'public');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function commitTag() {
    const t = tagDraft.trim().toLowerCase().slice(0, 24);
    if (!t) return;
    if (tags.includes(t)) { setTagDraft(''); return; }
    if (tags.length >= TAG_LIMIT) return;
    setTags([...tags, t]);
    setTagDraft('');
  }

  const stopCount = trip.stops?.length ?? 0;
  const tooFewStops = stopCount < 3;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Publish trip as template"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-xl p-6 max-w-md w-full shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)] flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif italic text-[22px] leading-tight text-paper truncate">
              {trip.isTemplate ? 'Manage template' : 'Publish as template'}
            </h2>
            <p className="text-paper-dim text-[12px] mt-1 leading-snug">
              {trip.isTemplate
                ? 'This trip is listed in the public templates library.'
                : 'Anyone can clone your route as a starting point for their own trip.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="bg-transparent border border-line text-paper-dim w-7 h-7 rounded text-base flex items-center justify-center hover:border-paper-dim hover:text-paper transition-colors shrink-0"
          >
            ×
          </button>
        </header>

        {!isPro && !trip.isTemplate && (
          <div className="bg-accent-soft border border-accent text-paper px-3 py-2 rounded text-[12px] leading-snug">
            Publishing templates is a Pro feature. Free users can still clone
            templates created by others.
          </div>
        )}

        {tooFewStops && !trip.isTemplate && (
          <div className="bg-[rgba(214,90,63,0.12)] border border-[rgba(214,90,63,0.4)] text-[#ec8e74] px-3 py-2 rounded text-[12px] leading-snug">
            Templates need at least 3 stops. This trip has {stopCount}.
          </div>
        )}

        {trip.isTemplate && (
          <div className="bg-canvas border border-line rounded px-3 py-2 font-mono text-[11px] tracking-[0.14em] uppercase text-paper-dim flex items-center gap-3">
            <span>Clones</span>
            <span className="text-paper text-[16px] font-medium tracking-normal normal-case">
              {trip.cloneCount ?? 0}
            </span>
          </div>
        )}

        <label className="block">
          <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">
            Short description
          </span>
          <textarea
            rows={3}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell other travellers what makes this route worth doing — terrain, vibe, season, must-stops."
            className="w-full bg-canvas border border-line text-paper font-serif italic text-[14px] px-3 py-2 rounded outline-none transition-colors focus:border-accent placeholder:text-paper-muted resize-none"
          />
          <span className="block text-right text-paper-muted text-[10px] mt-0.5">
            {description.length}/500
          </span>
        </label>

        <div>
          <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">
            Tags <span className="text-paper-muted/70">(up to {TAG_LIMIT})</span>
          </span>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-[3px] bg-canvas border border-line rounded-full text-[11px] text-paper"
              >
                {t}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  aria-label={`Remove tag ${t}`}
                  className="text-paper-muted hover:text-accent text-[12px] leading-none -mr-1 px-0.5"
                >
                  ×
                </button>
              </span>
            ))}
            {tags.length === 0 && (
              <span className="text-paper-muted text-[12px] italic">e.g. scandinavia, coastal, week-long</span>
            )}
          </div>
          <input
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                commitTag();
              } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
                setTags(tags.slice(0, -1));
              }
            }}
            onBlur={commitTag}
            placeholder="Add a tag and press Enter"
            disabled={tags.length >= TAG_LIMIT}
            className="w-full bg-canvas border border-line text-paper text-[13px] px-3 py-2 rounded outline-none transition-colors focus:border-accent placeholder:text-paper-muted disabled:opacity-50"
          />
        </div>

        <fieldset className="mt-3">
          <legend className="text-paper text-[13px] mb-1">Visibility</legend>
          <label className="flex items-start gap-2 mb-2">
            <input
              type="radio"
              name="templateVisibility"
              checked={visibility === 'public'}
              onChange={() => setVisibility('public')}
              className="mt-0.5 accent-accent"
            />
            <span className="flex-1">
              <span className="text-paper text-[13px]">Public</span>
              <span className="block text-paper-muted text-[11.5px] mt-0.5">
                Shown in the templates marketplace; anyone can browse and clone.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="templateVisibility"
              checked={visibility === 'unlisted'}
              onChange={() => setVisibility('unlisted')}
              className="mt-0.5 accent-accent"
            />
            <span className="flex-1">
              <span className="text-paper text-[13px]">Unlisted</span>
              <span className="block text-paper-muted text-[11.5px] mt-0.5">
                Hidden from the gallery; shareable by direct link only.
              </span>
            </span>
          </label>
        </fieldset>

        {errorMessage && (
          <div className="text-[#ec8e74] font-mono text-[10px] tracking-[0.14em] uppercase">
            {errorMessage}
          </div>
        )}

        <footer className="flex items-center justify-between gap-3 pt-1">
          {trip.isTemplate ? (
            <button
              type="button"
              onClick={onUnpublish}
              disabled={busy}
              className="bg-transparent border border-line text-paper-dim px-3.5 py-[7px] rounded text-[12px] tracking-wide transition-colors hover:border-[#ec8e74] hover:text-[#ec8e74] disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Unpublish'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-transparent border border-line text-paper-dim px-3.5 py-[7px] rounded text-[12px] tracking-wide transition-colors hover:border-paper-dim hover:text-paper"
            >
              {trip.isTemplate ? 'Close' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => onPublish({ templateDescription: description, templateTags: tags, templateVisibility: visibility })}
              disabled={busy || !isPro || tooFewStops}
              className="bg-accent text-canvas border border-accent rounded px-3.5 py-[7px] text-[12px] tracking-wide font-medium transition-colors hover:opacity-90 disabled:bg-surface-2 disabled:border-line disabled:text-paper-muted disabled:cursor-not-allowed"
            >
              {busy ? 'Working…' : (trip.isTemplate ? 'Update template' : 'Publish')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
