import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as buildConstants from './build-constants';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        dir: '.vite/build/web-content-preload',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/web-content-preload'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  define: {
    ...Object.fromEntries(
      Object.entries(buildConstants).map(([key, value]) => [
        key,
        JSON.stringify(value),
      ]),
    ),
  },
});
