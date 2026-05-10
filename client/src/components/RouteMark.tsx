export function RouteMark({ width = 92, muted = false }: { width?: number; muted?: boolean }) {
  return (
    <div
      className={muted ? 'route-mark-muted h-px' : 'route-mark h-px'}
      style={{ width }}
      aria-hidden
    />
  );
}
