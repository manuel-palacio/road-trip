import { useTheme } from '../hooks/useTheme';

const PREF_LABEL = {
  auto: 'Auto',
  light: 'Light',
  dark: 'Dark',
} as const;

const PREF_GLYPH = {
  auto: '◐',
  light: '☀',
  dark: '☾',
} as const;

/** Compact 3-state cycle button (auto → light → dark → auto). The
 * "auto" state follows the OS prefers-color-scheme. */
export function ThemeToggle({ className }: { className?: string } = {}) {
  const { pref, cycle } = useTheme();
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${PREF_LABEL[pref]} (click to switch)`}
      title={`Theme: ${PREF_LABEL[pref]} — click to switch`}
      className={
        className ||
        'inline-flex items-center gap-1.5 bg-transparent border border-line text-paper-dim px-2.5 py-[7px] rounded font-mono text-[9.5px] tracking-[0.18em] uppercase hover:text-paper hover:border-paper-dim transition-colors shrink-0'
      }
    >
      <span aria-hidden className="text-[12px] leading-none">{PREF_GLYPH[pref]}</span>
      {PREF_LABEL[pref]}
    </button>
  );
}
