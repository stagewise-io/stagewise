import * as esbuild from 'esbuild';
import type { BuildOptions } from 'esbuild';

const isWatch = process.argv.includes('--watch');

const buildOptions: BuildOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'esm',
  platform: 'node',
  target: 'node16',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
  external: [
    // Keep workspace dependencies as external since they'll be bundled separately
    '@stagewise/interface-client-runtime',
    '@stagewise/types',
  ],
};

if (isWatch) {
  const context = await esbuild.context(buildOptions);
  await context.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('Build complete');
}
