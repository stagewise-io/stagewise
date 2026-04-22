import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
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
    include: ['src/**/*.test.ts'],
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
