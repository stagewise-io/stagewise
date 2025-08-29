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
  external: [
    'vscode', // VSCode extension API should always be external
    // Node.js built-in modules
    'os',
    'path',
    'fs',
    'util',
    'stream',
    'events',
    'buffer',
    'crypto',
    'child_process',
    'http',
    'https',
    'url',
    'querystring',
    'assert',
    'zlib',
    'tty',
    'net',
    'dns',
    // Dependencies to prevent bundling issues
    'fast-glob',
    'fuse.js',
    'ignore',
    'minimatch',
    '@stagewise/agent-runtime-interface',
  ],
  sourcemap: false, // Disable source maps for security
  minify: true, // Always minify for published packages
  treeShaking: true,
  // Additional obfuscation options
  keepNames: false, // Don't preserve function/class names
};

if (isWatch) {
  const context = await esbuild.context(buildOptions);
  await context.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('Build complete');
}
