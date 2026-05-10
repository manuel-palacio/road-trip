type Tab = 'days' | 'pins';

type Props = {
  active: Tab;
  daysCount: number;
  pinsCount: number;
  onChange: (tab: Tab) => void;
};

export function SidebarTabs({ active, daysCount, pinsCount, onChange }: Props) {
  return (
    <div role="tablist" className="px-5 pt-3.5 pb-2.5 flex items-center gap-2 border-b border-line">
      <TabButton tab="days" active={active === 'days'} count={daysCount} onClick={() => onChange('days')}>
        Days
      </TabButton>
      <TabButton tab="pins" active={active === 'pins'} count={pinsCount} onClick={() => onChange('pins')}>
        Pins
      </TabButton>
    </div>
  );
}

function TabButton({
  tab,
  active,
  count,
  onClick,
  children,
}: {
  tab: Tab;
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={`tab-panel-${tab}`}
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-[6px] rounded-full font-mono text-[10px] tracking-[0.22em] uppercase transition-colors ${
        active
          ? 'bg-accent-soft border border-accent text-accent'
          : 'border border-line text-paper-dim hover:text-paper hover:border-paper-muted'
      }`}
    >
      <span>{children}</span>
      <span className={`text-[10px] tracking-normal ${active ? 'text-accent' : 'text-paper-muted'}`}>{count}</span>
    </button>
  );
}
