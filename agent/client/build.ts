import * as esbuild from 'esbuild';
import { argv } from 'node:process';
import type { BuildOptions } from 'esbuild';

const isWatchMode = argv.includes('--watch');

const baseOptions: BuildOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'es2020',
  external: ['@stagewise/agent-interface-internal'], // Keep Node.js built-ins external
  sourcemap: false, // Disable source maps for production
  minify: true,
  treeShaking: true,
  // Additional obfuscation options
  keepNames: false, // Don't preserve function/class names
  mangleProps: /^_/, // Mangle private properties starting with _
  mangleCache: {}, // Consistent mangling across builds
  legalComments: 'none', // Remove all comments
};

const esmBuildOptions: BuildOptions = {
  ...baseOptions,
  format: 'esm',
  outfile: 'dist/index.js',
};

const cjsBuildOptions: BuildOptions = {
  ...baseOptions,
  format: 'cjs',
  outfile: 'dist/index.cjs',
};

if (isWatchMode) {
  const esmCtx = await esbuild.context(esmBuildOptions);
  const cjsCtx = await esbuild.context(cjsBuildOptions);
  await Promise.all([esmCtx.watch(), cjsCtx.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([
    esbuild.build(esmBuildOptions),
    esbuild.build(cjsBuildOptions),
  ]);
  console.log('Build complete');
}
