import type { Stop } from './types';
import { flagEmoji } from './flags';

const STOP_TYPE_LABEL: Record<Stop['type'], string> = {
  start: 'Start',
  destination: 'Destination',
  overnight: 'Overnight',
  waypoint: 'Waypoint',
};

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Build the HTML body shown inside a Google Maps InfoWindow when the user
 * hovers or clicks a stop marker on the Builder map. Inline styles only —
 * the InfoWindow's chrome is white and isolated from the app's CSS. */
export function renderStopInfoHtml(stop: Stop, displayIndex: number): string {
  const flag = flagEmoji(stop.countryCode);
  const typeLabel = STOP_TYPE_LABEL[stop.type] || 'Stop';
  const meta: string[] = [];
  if (stop.dayNumber) meta.push(`Day ${stop.dayNumber}`);
  meta.push(typeLabel);
  const distanceLine: string[] = [];
  if (stop.kmFromPrevious && stop.kmFromPrevious > 0) {
    distanceLine.push(`${stop.kmFromPrevious} km from previous`);
  }
  if (stop.durationFromPrevious) distanceLine.push(stop.durationFromPrevious);
  const highlights = (stop.highlights || []).filter(Boolean);
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-width: 200px; max-width: 280px; padding: 2px 4px 4px;">
      <div style="font-size: 14px; font-weight: 600; color: #1a1a1a; line-height: 1.3; margin-bottom: 4px;">
        <span style="display: inline-block; min-width: 20px; color: #666;">${displayIndex}.</span>
        ${escape(stop.label || stop.name || '')}
        ${flag ? `<span style="margin-left: 4px;">${flag}</span>` : ''}
      </div>
      <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #666; margin-bottom: ${distanceLine.length || highlights.length ? '6px' : '0'};">
        ${meta.join(' · ')}
      </div>
      ${distanceLine.length
        ? `<div style="font-size: 12px; color: #444; margin-bottom: ${highlights.length ? '6px' : '0'};">${escape(distanceLine.join(' · '))}</div>`
        : ''}
      ${highlights.length
        ? `<div style="display: flex; flex-wrap: wrap; gap: 4px;">${highlights
            .map(
              (h) =>
                `<span style="display: inline-block; padding: 2px 8px; background: #f1efe8; border: 1px solid #d8d3c4; border-radius: 999px; font-size: 11px; color: #1a1a1a;">${escape(h)}</span>`,
            )
            .join('')}</div>`
        : ''}
    </div>
  `;
}
