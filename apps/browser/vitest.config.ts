import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  define: {
    __APP_RELEASE_CHANNEL__: JSON.stringify('dev'),
    __APP_BASE_NAME__: JSON.stringify('stagewise-test'),
    __APP_NAME__: JSON.stringify('stagewise-test'),
    __APP_BUNDLE_ID__: JSON.stringify('io.stagewise.test'),
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __APP_AUTHOR__: JSON.stringify('stagewise'),
    __APP_COPYRIGHT__: JSON.stringify('stagewise'),
    __APP_HOMEPAGE__: JSON.stringify('https://stagewise.io'),
    __APP_PLATFORM__: JSON.stringify('darwin'),
    __APP_ARCH__: JSON.stringify('arm64'),
  },
  ssr: {
    // web-tree-sitter ships WASM and uses CJS patterns — let Node
    // resolve it natively instead of Vite trying to transform it.
    external: ['web-tree-sitter'],
  },
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    testTimeout: 60000, // 60s — accommodates heavy SQLite tests on slow CI runners
    hookTimeout: 60000,
    fileParallelism: false, // Sequential execution for file system tests
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environmentMatchGlobs: [['src/ui/**/*.test.{ts,tsx}', 'jsdom']],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '.vite/',
        '**/*.d.ts',
        '**/*.config.*',
        'src/ui/**',
        'src/pages/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/backend'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@ui': path.resolve(__dirname, './src/ui'),
    },
  },
});
