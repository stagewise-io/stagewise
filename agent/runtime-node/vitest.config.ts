import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    testTimeout: 10000, // 10 seconds default timeout
    hookTimeout: 10000, // 10 seconds for hooks
    fileParallelism: false, // Sequential execution for file system tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'binaries/',
        '**/*.d.ts',
        '**/*.config.*',
        'src/__tests__/**',
        'build.ts',
      ],
    },
  },
});
