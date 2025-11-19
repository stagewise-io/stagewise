import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import type { PluginOption } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react() as PluginOption, tailwindcss() as unknown as PluginOption],
  resolve: {
    alias: {
      '@': resolve(process.cwd(), 'src/ui'),
    },
    mainFields: ['module', 'main'],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  build: {
    target: 'esnext',
    lib: {
      formats: ['es'],
      entry: 'src/renderer.ts',
      name: 'renderer',
      fileName: 'renderer',
    },
    commonjsOptions: {
      transformMixedEsModules: true,
      requireReturnsDefault: 'auto',
    },
  },
});
