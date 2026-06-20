import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { makePinContent, mapStyleForDropModeForTheme, mapStyleForTheme } from '../../lib/google-maps';
import { useTheme } from '../../hooks/useTheme';
import { PIN_CATEGORY_META } from '../../lib/pin-meta';
import { guessCategoryFromTypes } from '../../lib/place-to-category';
import type { Pin, PinCategory } from '../../lib/types';
import { DropModeBanner } from './DropModeBanner';
import { PinFab } from './PinFab';

type Props = {
  map: google.maps.Map | null;
  maps: typeof google.maps | null;
  pins: readonly Pin[];
  onRequestCreate: (input: { lat: number; lng: number; defaultName?: string; defaultCategory?: PinCategory }) => void;
  onRequestEdit: (pin: Pin) => void;
  onRequestDelete: (pin: Pin) => void;
};

export type PinMapLayerHandle = {
  focusPin: (pin: Pin) => void;
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function pinInfoHtml(pin: Pin): string {
  const meta = PIN_CATEGORY_META[pin.category];
  return `
    <div style="font-family:Geist,sans-serif;color:#1a1a1a;max-width:240px;">
      <div style="display:flex;align-items:center;gap:6px;font-family:'Geist Mono',monospace;font-size:9.5px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6358;">
        <span style="font-size:13px;line-height:1;">${meta.emoji}</span>${meta.label}
      </div>
      <div style="font-family:Fraunces,serif;font-style:italic;font-size:18px;line-height:1.15;margin-top:3px;">${escapeHtml(pin.name)}</div>
      ${pin.notes ? `<div style="font-size:12px;color:#3d3633;margin-top:6px;line-height:1.5;font-style:italic;">${escapeHtml(pin.notes)}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button id="pin-edit-${pin.id}" type="button" style="font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;background:transparent;border:1px solid #c9bfa9;color:#3d3633;padding:4px 9px;border-radius:4px;cursor:pointer;">Edit</button>
        <button id="pin-delete-${pin.id}" type="button" style="font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;background:transparent;border:1px solid #e0a99a;color:#c54f31;padding:4px 9px;border-radius:4px;cursor:pointer;">Delete</button>
      </div>
    </div>
  `;
}

export const PinMapLayer = forwardRef<PinMapLayerHandle, Props>(function PinMapLayer(
  { map, maps, pins, onRequestCreate, onRequestEdit, onRequestDelete },
  ref,
) {
  const [dropMode, setDropMode] = useState(false);
  const theme = useTheme();
  const pinMarkersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new globalThis.Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const handlersRef = useRef({ onRequestCreate, onRequestEdit, onRequestDelete });
  handlersRef.current = { onRequestCreate, onRequestEdit, onRequestDelete };

  // Init shared InfoWindow once SDK ready
  useEffect(() => {
    if (!maps || infoWindowRef.current) return;
    infoWindowRef.current = new maps.InfoWindow();
  }, [maps]);

  function openInfoWindow(pin: Pin, marker: google.maps.marker.AdvancedMarkerElement) {
    if (!infoWindowRef.current || !map) return;
    infoWindowRef.current.setContent(pinInfoHtml(pin));
    infoWindowRef.current.open({ map, anchor: marker });
    google.maps.event.addListenerOnce(infoWindowRef.current, 'domready', () => {
      document.getElementById(`pin-edit-${pin.id}`)?.addEventListener('click', () => {
        infoWindowRef.current?.close();
        handlersRef.current.onRequestEdit(pin);
      });
      document.getElementById(`pin-delete-${pin.id}`)?.addEventListener('click', () => {
        infoWindowRef.current?.close();
        handlersRef.current.onRequestDelete(pin);
      });
    });
  }

  // Sync pin markers
  useEffect(() => {
    if (!maps || !map) return;
    const liveIds = new Set(pins.map((p) => p.id));
    pinMarkersRef.current.forEach((marker, id) => {
      if (!liveIds.has(id)) {
        marker.map = null;
        pinMarkersRef.current.delete(id);
      }
    });
    void (google.maps as any).importLibrary('marker').then(() => {
      const { AdvancedMarkerElement } = google.maps.marker;
      pins.forEach((pin) => {
        const meta = PIN_CATEGORY_META[pin.category];
        const priority = pin.priority || 'want';
        const existing = pinMarkersRef.current.get(pin.id);
        if (existing) {
          existing.position = { lat: pin.lat, lng: pin.lng };
          existing.content = makePinContent(meta.emoji, meta.tint, priority);
          existing.title = pin.name;
          return;
        }
        const marker = new AdvancedMarkerElement({
          position: { lat: pin.lat, lng: pin.lng },
          map,
          content: makePinContent(meta.emoji, meta.tint, priority),
          title: pin.name,
          zIndex: priority === 'must' ? 60 : 50,
        });
        marker.addListener('gmp-click', () => openInfoWindow(pin, marker));
        pinMarkersRef.current.set(pin.id, marker);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, map, pins]);

  // Drop-mode side effects: cursor, POI labels, click handler
  useEffect(() => {
    if (!maps || !map) return;
    map.setOptions({
      draggableCursor: dropMode ? 'crosshair' : undefined,
      styles: dropMode ? mapStyleForDropModeForTheme(theme.resolved) : mapStyleForTheme(theme.resolved),
      clickableIcons: dropMode,
    });
    if (mapClickListenerRef.current) {
      mapClickListenerRef.current.remove();
      mapClickListenerRef.current = null;
    }
    if (dropMode) {
      mapClickListenerRef.current = map.addListener('click', (ev: google.maps.IconMouseEvent) => {
        if (ev.placeId) {
          ev.stop?.();
          const fallbackLat = ev.latLng?.lat() ?? 0;
          const fallbackLng = ev.latLng?.lng() ?? 0;
          if (!placesServiceRef.current) {
            placesServiceRef.current = new maps.places.PlacesService(map);
          }
          placesServiceRef.current.getDetails(
            { placeId: ev.placeId, fields: ['name', 'types', 'geometry.location'] },
            (place, status) => {
              if (status !== maps.places.PlacesServiceStatus.OK || !place) {
                handlersRef.current.onRequestCreate({ lat: fallbackLat, lng: fallbackLng });
              } else {
                handlersRef.current.onRequestCreate({
                  lat: place.geometry?.location?.lat() ?? fallbackLat,
                  lng: place.geometry?.location?.lng() ?? fallbackLng,
                  defaultName: place.name || '',
                  defaultCategory: guessCategoryFromTypes(place.types),
                });
              }
              setDropMode(false);
            },
          );
          return;
        }
        if (!ev.latLng) return;
        handlersRef.current.onRequestCreate({ lat: ev.latLng.lat(), lng: ev.latLng.lng() });
        setDropMode(false);
      });
    }
    return () => {
      mapClickListenerRef.current?.remove();
      mapClickListenerRef.current = null;
    };
  }, [maps, map, dropMode, theme.resolved]);

  // ESC cancels drop mode
  useEffect(() => {
    if (!dropMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDropMode(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dropMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pinMarkersRef.current.forEach((m) => { m.map = null; });
      pinMarkersRef.current.clear();
      mapClickListenerRef.current?.remove();
      infoWindowRef.current?.close();
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      focusPin: (pin: Pin) => {
        if (!map) return;
        map.panTo({ lat: pin.lat, lng: pin.lng });
        if ((map.getZoom() ?? 0) < 12) map.setZoom(13);
        // Attached pins have no marker — pan only, no info window.
        const marker = pinMarkersRef.current.get(pin.id);
        if (marker) openInfoWindow(pin, marker);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map],
  );

  return (
    <>
      {dropMode && <DropModeBanner onCancel={() => setDropMode(false)} />}
      <PinFab active={dropMode} onToggle={() => setDropMode((d) => !d)} />
    </>
  );
});
