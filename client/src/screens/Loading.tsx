export function Loading({ label = 'Plotting route' }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-7">
        <div className="relative w-[220px] h-px bg-line overflow-hidden">
          <div className="absolute inset-0 -translate-x-full animate-drift bg-gradient-to-r from-transparent via-accent to-transparent" />
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper-muted">
          {label}
        </div>
      </div>
    </div>
  );
}
