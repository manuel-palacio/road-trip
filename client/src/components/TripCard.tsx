import { useState } from 'react';
import type { Trip } from '../lib/types';

type Props = {
  trip: Trip;
  onEdit: (id: string) => void;
  onView: (id: string) => void;
  onDelete: (id: string) => void | Promise<unknown>;
  onTemplate?: (trip: Trip) => void;
};

export function TripCard({ trip, onEdit, onView, onDelete, onTemplate }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const flags = (trip.countries || []).join(' ');
  const totalDays = Number(trip.totalDays || 0);

  async function doDelete() {
    setDeleting(true);
    try {
      await onDelete(trip.id);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <article className="relative flex flex-col gap-3.5 px-[26px] pt-[26px] pb-4 bg-surface border border-line rounded-lg min-h-[240px] transition-all duration-200 ease-out-soft hover:border-line-strong hover:-translate-y-px">
      {trip.isTemplate && (
        <span
          title={`Published as template${typeof trip.cloneCount === 'number' ? ` · ${trip.cloneCount} clones` : ''}`}
          className="absolute top-3.5 right-3.5 inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-accent-soft border border-accent text-accent font-mono text-[9px] tracking-[0.16em] uppercase"
        >
          <span aria-hidden>★</span> Template
          {trip.templateVisibility === 'unlisted' && (
            <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-paper-muted ml-1.5 px-1.5 py-[2px] border border-line rounded">
              Unlisted
            </span>
          )}
        </span>
      )}
      <div className="text-[40px] leading-none">{trip.coverEmoji || '🚗'}</div>
      <h3 className="font-serif italic font-normal text-[26px] leading-[1.1] tracking-tight text-paper [overflow-wrap:anywhere]">
        {trip.name || 'Untitled trip'}
      </h3>
      <div className="flex items-center gap-4 font-mono text-[10.5px] tracking-[0.16em] uppercase text-paper-dim">
        <span><span className="text-paper font-medium mr-1">{Number(trip.totalKm || 0)}</span>km</span>
        <span>
          <span className="text-paper font-medium mr-1">{totalDays}</span>
          {totalDays === 1 ? 'day' : 'days'}
        </span>
      </div>
      <div className="text-[16px] tracking-wide min-h-[20px] text-paper" aria-label="countries">{flags}</div>

      {!confirming && (
        <div className="mt-auto pt-3.5 border-t border-line flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(trip.id)}
            className="bg-transparent border-0 px-2 py-1.5 rounded font-mono text-[10.5px] tracking-wider uppercase text-accent transition-colors duration-150 hover:text-paper"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onView(trip.id)}
            className="bg-transparent border-0 px-2 py-1.5 rounded text-[12px] tracking-wide text-paper-dim transition-colors duration-150 hover:text-paper"
          >
            View
          </button>
          {onTemplate && (
            <button
              type="button"
              onClick={() => onTemplate(trip)}
              title={trip.isTemplate ? 'Manage template' : 'Publish as template'}
              className="bg-transparent border-0 px-2 py-1.5 rounded text-[12px] tracking-wide text-paper-dim transition-colors duration-150 hover:text-paper"
            >
              {trip.isTemplate ? 'Template ✓' : 'Template'}
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label="Delete trip"
            className="bg-transparent border-0 px-2 py-1.5 rounded text-[12px] tracking-wide text-paper-dim transition-colors duration-150 hover:text-accent"
          >
            Delete
          </button>
        </div>
      )}

      {confirming && (
        <div className="mt-auto pt-3.5 border-t border-dashed border-accent flex items-center gap-1.5 font-mono text-[10.5px] tracking-wider uppercase text-accent">
          <span>Delete this trip?</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={doDelete}
            disabled={deleting}
            className="bg-transparent border-0 px-2 py-1.5 rounded text-[12px] tracking-wide text-paper-dim transition-colors duration-150 hover:text-accent disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Yes, delete'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={deleting}
            className="bg-transparent border-0 px-2 py-1.5 rounded text-[12px] tracking-wide text-paper-dim transition-colors duration-150 hover:text-paper"
          >
            Cancel
          </button>
        </div>
      )}
    </article>
  );
}
