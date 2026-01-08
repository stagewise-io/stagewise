import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import * as buildConstants from './build-constants';

// https://vite.dev/config/
export default defineConfig({
  root: path.resolve(__dirname, './src/ui'),
  base: './',
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
      '@': path.resolve(__dirname, './src/ui'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@ui': path.resolve(__dirname, './src/ui'),
    },
    mainFields: ['module', 'main'],
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    conditions: ['module', 'import', 'browser'],
    preserveSymlinks: false,
  },
  build: {
    outDir: path.resolve(__dirname, '.vite/renderer/main_window'),
    rollupOptions: {
      external: ['serialport', 'sqlite3'],
    },
    target: 'es2022',
  },
  optimizeDeps: {
    force: true,
  },
  cacheDir: 'node_modules/.vite/ui',
});
