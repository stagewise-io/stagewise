import path from 'node:path';
import { defineConfig } from 'vite';
import * as buildConstants from './build-constants';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    target: 'esnext',
    lib: {
      formats: ['es'],
      entry: 'src/backend/index.ts',
      name: 'main',
      fileName: 'main',
    },
    rollupOptions: {
      external: ['@libsql/client'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/backend'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
    conditions: ['node'],
    mainFields: ['module', 'main'],
  },
  define: {
    'process.env': JSON.stringify({
      BUILD_MODE: process.env.BUILD_MODE ?? 'production',
      NODE_ENV: process.env.NODE_ENV ?? 'production',
      POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
      POSTHOG_HOST: process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com',
      STAGEWISE_CONSOLE_URL:
        process.env.STAGEWISE_CONSOLE_URL ?? 'https://console.stagewise.io',
      API_URL: process.env.API_URL ?? 'https://v1.api.stagewise.io',
      LLM_PROXY_URL: process.env.LLM_PROXY_URL ?? 'https://llm.stagewise.io',
    }),
    ...Object.fromEntries(
      Object.entries(buildConstants).map(([key, value]) => [
        key,
        JSON.stringify(value),
      ]),
    ),
  },
});
