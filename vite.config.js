import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Local dev only — proxy /api to the local Express backend (`npm run dev:api`
  // on :3001) so the browser talks to it same-origin (no CORS). The backend's
  // CORS allowlist (server/cors.ts) only permits the Vercel origins but allows
  // no-Origin (server-to-server) requests, so we strip the browser Origin on
  // the proxied call. `server.proxy` has NO effect on `vite build` / the Vercel
  // deployment — production points the frontend at the Render API via
  // VITE_API_BASE_URL. Safe to commit.
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
          });
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: { modules: { classNameStrategy: 'non-scoped' } },
    // The `e2e/` directory holds Playwright specs that import @playwright/test
    // — they share the `.spec.ts` extension but are not vitest tests.
    exclude: ['node_modules', 'dist', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,jsx,ts,tsx}', 'api/**/*.ts'],
      exclude: ['**/*.test.*', '**/__tests__/**', 'src/test/**', 'src/data/**', 'node_modules/**', 'dist/**', 'coverage/**'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Slightly higher than the default 500kB so we don't get warnings on
    // routes that legitimately carry a chart library (recharts) or map.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Split heavy third-party deps out of the entry chunk so the marketing
        // landing page doesn't have to download recharts/leaflet/etc.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Match leaflet, react-leaflet, AND @react-leaflet/core. The earlier
          // regex `id.includes('/react-leaflet')` missed `/@react-leaflet/core`
          // (the `@` prefix has no preceding slash), which produced a circular
          // `vendor-leaflet -> vendor -> vendor-leaflet` warning under PR-7's
          // React.lazy split.
          if (id.includes('/leaflet') || id.includes('react-leaflet')) return 'vendor-leaflet';
          if (id.includes('/recharts') || id.includes('/d3-')) return 'vendor-charts';
          if (id.includes('/framer-motion') || id.includes('/motion-utils') || id.includes('/motion-dom')) return 'vendor-motion';
          if (id.includes('/@tanstack/')) return 'vendor-tanstack';
          if (id.includes('/react-router') || id.includes('/@remix-run')) return 'vendor-router';
          // Keep React core + its tightly coupled runtime deps together so a
          // generic `vendor` chunk can't circular-reference back into them
          // (which surfaced as `Cannot read properties of undefined (reading
          // 'forwardRef')` in production after chunk hashes shifted).
          if (/\/(react|react-dom|scheduler|use-sync-external-store|object-assign|js-tokens|loose-envify)\//.test(id)) {
            return 'vendor-react';
          }
          return 'vendor';
        },
      },
    },
  },
})
