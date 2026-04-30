import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
      '@contexts': fileURLToPath(new URL('./src/contexts', import.meta.url)),
      '@dashboard': fileURLToPath(new URL('./src/dashboard', import.meta.url)),
      '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
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
          if (id.includes('/leaflet') || id.includes('/react-leaflet')) return 'vendor-leaflet';
          if (id.includes('/recharts') || id.includes('/d3-')) return 'vendor-charts';
          if (id.includes('/framer-motion') || id.includes('/motion-utils') || id.includes('/motion-dom')) return 'vendor-motion';
          if (id.includes('/@tanstack/')) return 'vendor-tanstack';
          if (id.includes('/react-router') || id.includes('/@remix-run')) return 'vendor-router';
          if (id.includes('/react-dom') || /\/react\//.test(id)) return 'vendor-react';
          return 'vendor';
        },
      },
    },
  },
})
