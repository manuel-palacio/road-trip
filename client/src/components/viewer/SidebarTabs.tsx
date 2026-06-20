type Tab = 'days' | 'pins' | 'budget';

type Props = {
  active: Tab;
  daysCount: number;
  pinsCount: number;
  budgetCount: number;
  isPro: boolean;
  onChange: (tab: Tab) => void;
};

export function SidebarTabs({ active, daysCount, pinsCount, budgetCount, isPro, onChange }: Props) {
  return (
    <div role="tablist" className="px-5 pt-3.5 pb-2.5 flex items-center gap-2 border-b border-line">
      <TabButton tab="days" active={active === 'days'} count={daysCount} onClick={() => onChange('days')}>
        Days
      </TabButton>
      <TabButton tab="pins" active={active === 'pins'} count={pinsCount} onClick={() => onChange('pins')}>
        Pins
      </TabButton>
      <TabButton
        tab="budget"
        active={active === 'budget'}
        count={budgetCount}
        onClick={() => onChange('budget')}
        accent={isPro}
      >
        Budget
      </TabButton>
    </div>
  );
}

function TabButton({
  tab,
  active,
  count,
  onClick,
  accent,
  children,
}: {
  tab: Tab;
  active: boolean;
  count: number;
  onClick: () => void;
  accent?: boolean;
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
          : accent
          ? 'border border-accent/40 text-accent/70 hover:text-accent hover:border-accent'
          : 'border border-line text-paper-dim hover:text-paper hover:border-paper-muted'
      }`}
    >
      <span>{children}</span>
      <span className={`text-[10px] tracking-normal ${active ? 'text-accent' : 'text-paper-muted'}`}>{count}</span>
    </button>
  );
}
