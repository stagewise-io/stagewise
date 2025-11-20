import { readFile } from 'node:fs/promises';
import path, { resolve } from 'node:path';
import { defineConfig } from 'vite';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Read package.json to get version
const packageJson = JSON.parse(
  await readFile(resolve(__dirname, 'package.json'), 'utf-8'),
);
const version = packageJson.version;

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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/backend'),
    },
    conditions: ['node'],
    mainFields: ['module', 'main'],
  },
  define: {
    'process.env': JSON.stringify({
      NODE_ENV: process.env.NODE_ENV || 'production',
      POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
      POSTHOG_HOST: process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com',
      STAGEWISE_CONSOLE_URL:
        process.env.STAGEWISE_CONSOLE_URL ?? 'https://console.stagewise.io',
      API_URL: process.env.API_URL ?? 'https://v1.api.stagewise.io',
      LLM_PROXY_URL: process.env.LLM_PROXY_URL ?? 'https://llm.stagewise.io',
      CLI_VERSION: version,
    }),
  },
});
