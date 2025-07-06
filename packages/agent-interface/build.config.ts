import { defineConfig } from 'tsup';

/**
 * Build configuration for @stagewise/agent-interface package
 *
 * This configuration creates:
 * - Two separate entry points: `toolbar` and `agent` in subfolders
 * - Both ESModule (.js) and CommonJS (.cjs) bundles for each entry point
 * - Single TypeScript declaration files (.d.ts) shared between both formats
 * - Bundled code without minification for better debugging
 * - Tree-shaking enabled for smaller bundle sizes
 */
export default defineConfig([
  // JavaScript bundles (ESM + CJS) for toolbar
  {
    entry: {
      toolbar: 'src/toolbar/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: false,
    minify: false,
    bundle: true,
    clean: true,
    outDir: 'dist',
    external: [],
    splitting: false,
    treeshake: true,
  },
  // JavaScript bundles (ESM + CJS) for agent
  {
    entry: {
      agent: 'src/agent/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: false,
    minify: false,
    bundle: true,
    clean: false, // Don't clean since toolbar already cleaned
    outDir: 'dist',
    external: ['express', 'ws', 'cors'],
    splitting: false,
    treeshake: true,
  },
]);
