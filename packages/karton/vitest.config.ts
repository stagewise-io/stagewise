import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    environmentMatchGlobs: [['test/react/**', 'jsdom']],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'test/', 'build.js', 'vitest.config.ts'],
    },
  },
});
