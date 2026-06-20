import { beforeAll, describe, expect, it } from 'vitest';
import { makeMarkerContent, makePinContent } from '../google-maps';

// Minimal DOM stubs needed for the content-builder functions.
beforeAll(() => {
  (globalThis as any).google = { maps: {} };
});

describe('makeMarkerContent', () => {
  it('returns a div with SVG innerHTML', () => {
    const div = makeMarkerContent(3, '#e76f51');
    expect(div.tagName).toBe('DIV');
    expect(div.innerHTML).toContain('<svg');
  });

  it('no category: SVG embeds the city emoji and the corner sequence number', () => {
    const div = makeMarkerContent(3, '#e76f51');
    expect(div.innerHTML).toContain('🏙');
    expect(div.innerHTML).toContain('>3<');
  });

  it('category=fuel: SVG embeds the fuel emoji and the corner sequence number', () => {
    const div = makeMarkerContent(3, '#e76f51', 'fuel');
    expect(div.innerHTML).toContain('⛽');
    expect(div.innerHTML).toContain('>3<');
  });

  it('category=hotel: SVG embeds the hotel emoji', () => {
    const div = makeMarkerContent(5, '#e76f51', 'hotel');
    expect(div.innerHTML).toContain('🛏');
    expect(div.innerHTML).toContain('>5<');
  });

  it('category=food: SVG embeds the food emoji', () => {
    const div = makeMarkerContent(1, '#e76f51', 'food');
    expect(div.innerHTML).toContain('🍴');
  });

  it('category=scenic: SVG embeds the scenic emoji', () => {
    const div = makeMarkerContent(2, '#e76f51', 'scenic');
    expect(div.innerHTML).toContain('🌄');
  });

  it('category=landmark: SVG embeds the landmark emoji', () => {
    const div = makeMarkerContent(4, '#e76f51', 'landmark');
    expect(div.innerHTML).toContain('📍');
  });
});

describe('makePinContent', () => {
  it('returns a div with the teardrop SVG path', () => {
    const div = makePinContent('🍴', '#a0c4a0');
    expect(div.tagName).toBe('DIV');
    expect(div.innerHTML).toContain('<svg');
    expect(div.innerHTML).toContain('M22 2');
  });

  it('embeds the emoji in the SVG', () => {
    const div = makePinContent('⛽', '#f0a000', 'must');
    expect(div.innerHTML).toContain('⛽');
  });

  it('priority=maybe reduces opacity', () => {
    const div = makePinContent('📍', '#a0a0a0', 'maybe');
    expect(div.innerHTML).toContain('opacity="0.78"');
  });

  it('priority=must applies accent ring color', () => {
    const div = makePinContent('🛏', '#a0a0a0', 'must');
    expect(div.innerHTML).toContain('#e76f51');
  });
});
