#!/usr/bin/env tsx

import { mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.join(directory, '..', 'bundled', 'acp');

async function bundle(entryPoint: string, outfile: string): Promise<void> {
  await build({
    entryPoints: [entryPoint],
    outfile: path.join(outputDirectory, outfile),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: false,
    minify: true,
  });
}

async function main(): Promise<void> {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    bundle(require.resolve('@agentclientprotocol/codex-acp'), 'codex-acp.mjs'),
    bundle(
      require.resolve('@agentclientprotocol/claude-agent-acp/dist/index.js'),
      'claude-agent-acp.mjs',
    ),
    bundle(
      path.join(
        directory,
        '..',
        'src',
        'backend',
        'agents',
        'acp',
        'stagewise-mcp-server.ts',
      ),
      'stagewise-mcp-server.mjs',
    ),
  ]);
}

await main();
