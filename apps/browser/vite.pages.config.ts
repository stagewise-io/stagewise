import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import * as buildConstants from './build-constants';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
);
const _appVersion = packageJson.version;

// Release channel: 'dev' | 'prerelease' | 'release'
const _releaseChannel = process.env.RELEASE_CHANNEL || 'dev';

// https://vite.dev/config/
export default defineConfig({
  root: path.resolve(__dirname, './src/pages'),
  base: './',
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: 'routes',
      generatedRouteTree: 'routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
  ],
  define: {
    'process.env': 'import.meta.env',
    // Inject build-time constants
    ...Object.fromEntries(
      Object.entries(buildConstants).map(([key, value]) => [
        key,
        JSON.stringify(value),
      ]),
    ),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/pages'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@ui': path.resolve(__dirname, './src/ui'),
      '@assets': path.resolve(__dirname, './assets/pages'),
      // 'use-sync-external-store/shim/with-selector.js': 'react',
      // 'use-sync-external-store/shim/index.js': 'react',
    },
    mainFields: ['module', 'main'],
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    conditions: ['module', 'import', 'browser'],
    preserveSymlinks: false,
  },
  build: {
    outDir: path.resolve(__dirname, '.vite/renderer/pages'),
    rollupOptions: {
      external: ['serialport', 'sqlite3'],
    },
    target: 'es2022',
  },
  optimizeDeps: {
    force: true,
    exclude: ['@tanstack/react-router', '@tanstack/react-router-devtools'],
    include: ['use-sync-external-store', 'use-sync-external-store/**/*'],
  },
  server: {
    port: 5174,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5174,
    },
  },
  cacheDir: 'node_modules/.vite/pages',
});
