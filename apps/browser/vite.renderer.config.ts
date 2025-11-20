import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  define: {
    'process.env': 'import.meta.env',
    'process.type': JSON.stringify('renderer'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/ui'),
    },
    mainFields: ['module', 'main'],
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    conditions: ['module', 'import', 'browser'],
    preserveSymlinks: false,
  },
  build: {
    rollupOptions: {
      external: ['serialport', 'sqlite3'],
    },
  },
});
