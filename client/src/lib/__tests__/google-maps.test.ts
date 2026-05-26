import { beforeAll, describe, expect, it } from 'vitest';
import { makeMarkerIcon } from '../google-maps';

// Mock google.maps.Point / google.maps.Size — the marker uses them as
// plain x/y holders; the SVG payload is what we assert on.
beforeAll(() => {
  (globalThis as any).google = {
    maps: {
      Point: class { constructor(public x: number, public y: number) {} },
      Size:  class { constructor(public w: number, public h: number) {} },
    },
  };
});

function decode(icon: ReturnType<typeof makeMarkerIcon>): string {
  const raw = icon.url ?? '';
  const i = raw.indexOf(',');
  return decodeURIComponent(raw.slice(i + 1));
}

describe('makeMarkerIcon', () => {
  it('no category: SVG embeds the city emoji and the corner sequence number', () => {
    const svg = decode(makeMarkerIcon(3, '#e76f51'));
    expect(svg).toContain('🏙');
    expect(svg).toContain('>3<');
  });

  it('category=fuel: SVG embeds the fuel emoji and the corner sequence number', () => {
    const svg = decode(makeMarkerIcon(3, '#e76f51', 'fuel'));
    expect(svg).toContain('⛽');
    expect(svg).toContain('>3<');
  });

  it('category=hotel: SVG embeds the hotel emoji', () => {
    const svg = decode(makeMarkerIcon(5, '#e76f51', 'hotel'));
    expect(svg).toContain('🛏');
    expect(svg).toContain('>5<');
  });

  it('category=food: SVG embeds the food emoji', () => {
    const svg = decode(makeMarkerIcon(1, '#e76f51', 'food'));
    expect(svg).toContain('🍴');
  });

  it('category=scenic: SVG embeds the scenic emoji', () => {
    const svg = decode(makeMarkerIcon(2, '#e76f51', 'scenic'));
    expect(svg).toContain('🌄');
  });

  it('category=landmark: SVG embeds the landmark emoji', () => {
    const svg = decode(makeMarkerIcon(4, '#e76f51', 'landmark'));
    expect(svg).toContain('📍');
  });
});
