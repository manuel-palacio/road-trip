/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // All tokens read CSS variables defined in globals.css. The
        // dark theme is the default (set on :root); light mode is
        // applied by adding .theme-light to <html>.
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        'canvas-strong': 'rgb(var(--color-canvas-strong) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--color-surface-2) / <alpha-value>)',
        paper: 'rgb(var(--color-paper) / <alpha-value>)',
        'paper-dim': 'rgb(var(--color-paper-dim) / <alpha-value>)',
        'paper-muted': 'rgb(var(--color-paper-muted) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--color-accent) / 0.14)',
        line: 'rgb(var(--color-line) / 0.10)',
        'line-strong': 'rgb(var(--color-line) / 0.20)',
        // Status hues (issue #124). Each has a -soft companion for chip
        // fills; borders use the base at 40-50% via `/` opacity.
        success: 'rgb(var(--color-success) / <alpha-value>)',
        'success-soft': 'rgb(var(--color-success) / 0.16)',
        warn: 'rgb(var(--color-warn) / <alpha-value>)',
        'warn-soft': 'rgb(var(--color-warn) / 0.16)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        'danger-soft': 'rgb(var(--color-danger) / 0.18)',
        // Fixed, theme-independent pair for text sitting on the DAY_COLORS
        // palette, which is the same in both themes.
        ink: '#0d0e11',
        chalk: '#f3ecde',
      },
      fontSize: {
        // Named steps for the mono/label scale that dominates this UI.
        // Existing text-[Npx] usages stay valid; new work should pick from
        // here so the scale stops growing.
        micro: ['9.5px', { lineHeight: '1.3' }],
        label: ['10px', { lineHeight: '1.3' }],
        meta: ['11px', { lineHeight: '1.4' }],
        body: ['13px', { lineHeight: '1.5' }],
        'body-lg': ['14px', { lineHeight: '1.5' }],
        title: ['20px', { lineHeight: '1.15' }],
      },
      boxShadow: {
        modal: '0 24px 60px -12px rgba(0,0,0,0.6)',
        pop: '0 20px 50px -12px rgba(0,0,0,0.6)',
        lift: '0 12px 30px -8px rgba(0,0,0,0.5)',
        'accent-lift': '0 8px 24px -6px rgb(var(--color-accent) / 0.5)',
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SF Mono', 'monospace'],
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        drift: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        rise: 'rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        drift: 'drift 1.6s cubic-bezier(0.2, 0.8, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};
