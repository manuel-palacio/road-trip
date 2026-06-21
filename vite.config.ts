import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Road Trip',
        short_name: 'Road Trip',
        description: 'Plan multi-day road trips with stops, pins, day-by-day routing and Android Auto hand-off.',
        theme_color: '#0d0e11',
        background_color: '#13151a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: '192x192 512x512 any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // App shell — index.html, JS/CSS bundles, the SVG icon. Workbox
        // injects the precache manifest at build time.
        globPatterns: ['**/*.{js,css,html,svg,ico,woff,woff2}'],
        // Skip waiting + clientsClaim mean a new SW activates immediately
        // on next page load, no manual update prompt needed.
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        // Don't intercept API mutations or Google Maps / Firebase Auth
        // — those need fresh network responses.
        navigateFallbackDenylist: [/^\/api\//, /^\/config/],
        runtimeCaching: [
          {
            // GET trip / pin / share / config data — try network first
            // so it stays fresh; fall back to the cache when offline.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              (url.pathname.startsWith('/api/') || url.pathname === '/config'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'roadtrip-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts CSS — short-lived cache so font updates land.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // Google Fonts files — long-lived cache (font binaries
            // never change once a version ships).
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  root: 'client',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    // Allow Firebase Auth's signInWithPopup to communicate back across
    // the OAuth popup boundary. Default Vite COOP would block window.closed
    // checks and break the popup flow on dev.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      '/api':       'http://localhost:8080',
      '/config':    'http://localhost:8080',
      '/health':    'http://localhost:8080',
      '/actuator':  'http://localhost:8080',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
