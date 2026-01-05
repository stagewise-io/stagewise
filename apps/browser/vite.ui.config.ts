import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
);
const appVersion = packageJson.version;

// Release channel: 'dev' | 'prerelease' | 'release'
const releaseChannel = process.env.RELEASE_CHANNEL || 'dev';

// https://vite.dev/config/
export default defineConfig({
  root: path.resolve(__dirname, './src/ui'),
  base: './',
  plugins: [react(), tailwindcss()],
  define: {
    'process.env': 'import.meta.env',
    // Inject build-time constants (access via __APP_VERSION__ and __RELEASE_CHANNEL__)
    __APP_VERSION__: JSON.stringify(appVersion),
    __RELEASE_CHANNEL__: JSON.stringify(releaseChannel),
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
