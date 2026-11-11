import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Static SPA build for Cloudflare Pages (output: dist/). No server runtime required.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Stable vendor chunks for caching; 3D, charts, PDF and seed data are lazy-loaded per route.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\/](react|react-dom|scheduler|react-router|react-router-dom)[\/]/.test(id)) return 'vendor-react';
          if (/[\/](motion|motion-dom|motion-utils|framer-motion)[\/]/.test(id)) return 'vendor-motion';
          if (/[\/](dexie|immer|zustand)[\/]/.test(id)) return 'vendor-data';
          if (/[\/](@radix-ui|radix-ui|@floating-ui|cmdk|sonner|react-remove-scroll|aria-hidden)[\/]/.test(id)) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
