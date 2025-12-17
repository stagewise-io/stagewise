import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
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
      '@': path.resolve(__dirname, './src/ui'),
      '@shared': path.resolve(__dirname, './src/shared'),
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
    target: 'es2022',
  },
});
