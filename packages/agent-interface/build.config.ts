import { defineConfig } from 'tsup';

/**
 * Build configuration for @stagewise/agent-interface package
 *
 * This configuration creates:
 * - Two separate entry points: `toolbar` and `agent`
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
    dts: false, // Skip duplicate .d.cts generation
    sourcemap: false,
    minify: false,
    bundle: true,
    clean: false,
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
    dts: false, // Skip duplicate .d.cts generation
    sourcemap: false,
    minify: false,
    bundle: true,
    clean: false,
    outDir: 'dist',
    external: [
      // Node.js built-in modules that should not be bundled
      'node:net',
      'node:http',
      'node:url',
      'node:path',
      'node:fs',
      'node:stream',
      'node:crypto',
      'node:events',
      'node:util',
      'node:buffer',
      'node:querystring',
      'node:zlib',
      // WebSocket library is external since it's in devDependencies
      'ws',
    ],
    splitting: false,
    treeshake: true,
  },
  // TypeScript declarations for toolbar
  {
    entry: {
      toolbar: 'src/toolbar/index.ts',
    },
    format: ['esm'], // Only need one format for types
    dts: {
      only: true, // Only generate .d.ts files
    },
    outDir: 'dist',
  },
  // TypeScript declarations for agent
  {
    entry: {
      agent: 'src/agent/index.ts',
    },
    format: ['esm'], // Only need one format for types
    dts: {
      only: true, // Only generate .d.ts files
    },
    outDir: 'dist',
  },
]);
