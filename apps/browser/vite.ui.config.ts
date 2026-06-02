import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import * as buildConstants from './build-constants';

// https://vite.dev/config/
export default defineConfig({
  root: path.resolve(__dirname, './src/ui'),
  base: './',
  envDir: path.resolve(__dirname),
  plugins: [react(), tailwindcss()],
  define: {
    'process.env': 'import.meta.env',
    // Inject build-time constants (access via __APP_VERSION__ and __APP_RELEASE_CHANNEL__)
    ...Object.fromEntries(
      Object.entries(buildConstants).map(([key, value]) => [
        key,
        JSON.stringify(value),
      ]),
    ),
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
      '@ui': path.resolve(__dirname, './src/ui'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@assets': path.resolve(__dirname, './assets/pages'),
    },
    mainFields: ['module', 'main'],
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    conditions: ['module', 'import', 'browser'],
    preserveSymlinks: false,
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: path.resolve(__dirname, '.vite/renderer/main_window'),
    sourcemap: 'hidden',
    rollupOptions: {
      external: ['serialport', 'sqlite3'],
    },
    target: 'es2022',
  },
  // NOTE: do NOT set `optimizeDeps.force: true` here. It discards Vite's
  // dependency pre-bundle cache and re-optimizes the entire node_modules tree
  // (ai-sdk, mermaid, shiki, three, recharts, tiptap, ...) on EVERY dev start,
  // which is the dominant dev-mode startup cost. Vite already re-optimizes
  // automatically when the lockfile or this config changes. For the rare
  // pnpm-hoisting staleness case, run `pnpm clear-vite-cache` (selective).
  cacheDir: 'node_modules/.vite/ui',
});
