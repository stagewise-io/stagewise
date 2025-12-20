import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    'process.env': 'import.meta.env' /*JSON.stringify({
      BUILD_MODE: process.env.BUILD_MODE ?? 'production',
      NODE_ENV: process.env.NODE_ENV ?? 'production',
      POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
      POSTHOG_HOST: process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com',
      STAGEWISE_CONSOLE_URL:
        process.env.STAGEWISE_CONSOLE_URL ?? 'https://console.stagewise.io',
      API_URL: process.env.API_URL ?? 'https://v1.api.stagewise.io',
      LLM_PROXY_URL: process.env.LLM_PROXY_URL ?? 'https://llm.stagewise.io',
      CLI_VERSION: version,
    }),*/,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/pages'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@ui': path.resolve(__dirname, './src/ui'),
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
