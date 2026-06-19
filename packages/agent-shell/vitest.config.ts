import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: {
    // node-pty ships native .node binaries — let Node resolve it
    // natively instead of Vite trying to transform it.
    external: ['node-pty'],
  },
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    testTimeout: 60000, // 60s — PTY integration tests need to spawn shells and wait for command execution
    hookTimeout: 60000,
    fileParallelism: false, // Sequential execution — PTY tests are resource-intensive and shouldn't contend
    include: ['src/**/*.test.ts'],
  },
});
