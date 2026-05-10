export function flagEmoji(cc?: string | null): string {
  if (!cc || cc.length !== 2) return '';
  return String.fromCodePoint(
    ...cc.toUpperCase().split('').map((c) => c.charCodeAt(0) + 127397),
  );
}

export function extractCountryCode(
  components?: google.maps.GeocoderAddressComponent[],
): string {
  if (!components) return '';
  const c = components.find((x) => x.types.includes('country'));
  return c?.short_name || '';
}
