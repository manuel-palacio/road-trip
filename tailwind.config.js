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
