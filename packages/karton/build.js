#!/usr/bin/env node

import esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Clean dist directory
rmSync(resolve(__dirname, 'dist'), { recursive: true, force: true });
mkdirSync(resolve(__dirname, 'dist'), { recursive: true });

// Entry points
const entryPoints = {
  'shared/index': 'src/shared/index.ts',
  'server/index': 'src/server/index.ts',
  'client/index': 'src/client/index.ts',
  'react/client/index': 'src/react/client/index.ts',
};

// Build configuration
const buildConfig = {
  entryPoints,
  bundle: true,
  outdir: 'dist',
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
  external: ['ws', 'express', 'react', 'react-dom', 'superjson', 'uuid'],
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
  },
};

// Build for Node.js (server and shared)
console.log('Building Node.js modules...');
await esbuild.build({
  ...buildConfig,
  entryPoints: {
    'shared/index': 'src/shared/index.ts',
    'server/index': 'src/server/index.ts',
  },
});

// Build for browser (client and React)
console.log('Building browser modules...');
await esbuild.build({
  ...buildConfig,
  platform: 'browser',
  target: 'es2020',
  entryPoints: {
    'client/index': 'src/client/index.ts',
    'react/client/index': 'src/react/client/index.ts',
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    process: JSON.stringify({ env: { NODE_ENV: 'production' } }),
    global: 'globalThis',
  },
});

// Generate TypeScript declarations
console.log('Generating TypeScript declarations...');
execSync('tsc --emitDeclarationOnly --outDir dist', {
  stdio: 'inherit',
});

// Create package.json for proper exports
const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8'),
);

// Update exports in package.json to point to dist
packageJson.exports = {
  './shared': {
    types: './dist/shared/index.d.ts',
    import: './dist/shared/index.js',
  },
  './server': {
    types: './dist/server/index.d.ts',
    import: './dist/server/index.js',
  },
  './client': {
    types: './dist/client/index.d.ts',
    import: './dist/client/index.js',
  },
  './react/client': {
    types: './dist/react/client/index.d.ts',
    import: './dist/react/client/index.js',
  },
};

// Write updated package.json
writeFileSync(
  resolve(__dirname, 'dist', 'package.json'),
  JSON.stringify(
    {
      ...packageJson,
      main: './shared/index.js',
      types: './shared/index.d.ts',
      files: ['**/*'],
    },
    null,
    2,
  ),
);

console.log('Build complete!');
