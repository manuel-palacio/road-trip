import { describe, expect, it } from 'vitest';
import { renderStopInfoHtml } from '../stop-info-html';
import type { Stop } from '../types';

const stop = (type: Stop['type']): Stop => ({
  id: 's1', name: 'Circle K', label: 'Circle K', lat: 49, lng: 4, type,
});

describe('renderStopInfoHtml', () => {
  it('labels each stop type, including fuel', () => {
    expect(renderStopInfoHtml(stop('start'), 1)).toContain('Start');
    expect(renderStopInfoHtml(stop('overnight'), 1)).toContain('Overnight');
    expect(renderStopInfoHtml(stop('fuel'), 1)).toContain('Fuel stop');
  });

  it('escapes HTML in the stop name', () => {
    const s = { ...stop('waypoint'), label: '<img src=x>', name: '<img src=x>' };
    const html = renderStopInfoHtml(s, 1);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
