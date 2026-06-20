import { afterEach, describe, expect, it } from 'vitest';
import { loadMapsSdk } from '../google-maps';

// Separate file from google-maps.test.ts on purpose: that suite installs a
// global `google.maps` mock in beforeAll, which would make loadMapsSdk
// resolve immediately and bypass the loader logic under test here.

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).google;
});

describe('loadMapsSdk', () => {
  it('does not cache a failed load — a later call can succeed', async () => {
    await expect(loadMapsSdk('')).rejects.toThrow('Maps API key missing');

    const fakeMaps = { marker: 'sentinel' };
    (window as unknown as Record<string, unknown>).google = { maps: fakeMaps };

    await expect(loadMapsSdk('')).resolves.toBe(fakeMaps);
  });
});
