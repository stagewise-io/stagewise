import { readFile } from 'node:fs/promises';
import path, { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read package.json to get version
const packageJson = JSON.parse(
  await readFile(resolve(__dirname, 'package.json'), 'utf-8'),
);
const appVersion = packageJson.version;

// Release channel: 'dev' | 'prerelease' | 'release'
const releaseChannel = process.env.RELEASE_CHANNEL || 'dev';

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
      external: ['@libsql/client', /^@libsql\/.*/],
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
    __APP_VERSION__: JSON.stringify(appVersion),
    __RELEASE_CHANNEL__: JSON.stringify(releaseChannel),
  },
});
