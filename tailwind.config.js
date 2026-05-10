/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0d0e11',
        surface: '#16181c',
        'surface-2': '#1c1f25',
        paper: '#f3ecde',
        'paper-dim': '#9b9080',
        'paper-muted': '#5d564d',
        accent: '#e76f51',
        'accent-soft': 'rgba(231, 111, 81, 0.14)',
        line: 'rgba(243, 236, 222, 0.08)',
        'line-strong': 'rgba(243, 236, 222, 0.16)',
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
