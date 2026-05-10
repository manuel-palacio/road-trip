import { useEffect, useRef } from 'react';
import { guessCategoryFromTypes } from '../../lib/place-to-category';
import type { PinCategory } from '../../lib/types';

type Props = {
  maps: typeof google.maps | null;
  onSelect: (place: { lat: number; lng: number; name: string; category: PinCategory }) => void;
};

export function PinSearchBar({ maps, onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!maps || !inputRef.current || autocompleteRef.current) return;
    autocompleteRef.current = new maps.places.Autocomplete(inputRef.current, {
      fields: ['name', 'formatted_address', 'geometry.location', 'types'],
    });
    const listener = autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace();
      if (!place?.geometry?.location) return;
      onSelect({
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        name: place.name || place.formatted_address || '',
        category: guessCategoryFromTypes(place.types),
      });
      if (inputRef.current) inputRef.current.value = '';
    });
    return () => {
      listener.remove();
    };
  }, [maps, onSelect]);

  return (
    <div className="relative mb-3">
      <span className="absolute left-[14px] top-1/2 -translate-y-1/2 text-paper-muted text-[13px] pointer-events-none">⌕</span>
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        placeholder="Find a place to pin…"
        className="w-full bg-canvas border border-line rounded-md text-paper text-[13px] pl-[34px] pr-3 py-[9px] outline-none transition-colors focus:border-accent placeholder:text-paper-muted"
      />
    </div>
  );
}
