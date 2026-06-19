import { defineConfig } from 'vitest/config';

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
    fileParallelism: false, // Sequential execution — avoids I/O contention from concurrent SQLite temp DBs
    include: ['src/**/*.test.ts'],
  },
});
