#!/usr/bin/env node

import esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

rmSync(resolve(__dirname, 'dist'), { recursive: true, force: true });
mkdirSync(resolve(__dirname, 'dist'), { recursive: true });

console.log('Building @stagewise/agent-core...');
await esbuild.build({
  entryPoints: {
    index: 'src/index.ts',
    'types/index': 'src/types/index.ts',
    'types/agent': 'src/types/agent.ts',
    'types/diff-history': 'src/types/diff-history.ts',
    'types/metadata': 'src/types/metadata.ts',
    'types/models': 'src/types/models.ts',
    'types/tool-approval': 'src/types/tool-approval.ts',
    'types/tools': 'src/types/tools.ts',
    'store/index': 'src/store/index.ts',
    'commands/index': 'src/commands/index.ts',
    'host/index': 'src/host/index.ts',
    'host/test-utils': 'src/host/test-utils.ts',
    'migrate-database/index': 'src/migrate-database/index.ts',
    'workspace/index': 'src/workspace/index.ts',
    'services/diff-history/index-barrel':
      'src/services/diff-history/index-barrel.ts',
    'services/toolbox/index': 'src/services/toolbox/index.ts',
    'services/mount-manager/index': 'src/services/mount-manager/index.ts',
    'ast/index': 'src/ast/index.ts',
    'plans/index': 'src/plans/index.ts',
    'plans/read': 'src/plans/read.ts',
    'logs/index': 'src/logs/index.ts',
    'logs/read': 'src/logs/read.ts',
    'services/attachments/index': 'src/services/attachments/index.ts',
    'services/agent-persistence/index':
      'src/services/agent-persistence/index.ts',
    'services/file-read-cache/index': 'src/services/file-read-cache/index.ts',
    'services/processed-image-cache/index':
      'src/services/processed-image-cache/index.ts',
    'services/persistence/index': 'src/services/persistence/index.ts',
    'services/agent-manager/index': 'src/services/agent-manager/index.ts',
    'file-read-transformer/index': 'src/file-read-transformer/index.ts',
    'env/index': 'src/env/index.ts',
    'env/adapters/index': 'src/env/adapters/index.ts',
    'agents/index': 'src/agents/index.ts',
  },
  bundle: true,
  outdir: 'dist',
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
  external: [
    '@ai-sdk/anthropic',
    '@ai-sdk/google',
    '@ai-sdk/openai',
    '@libsql/client',
    'ai',
    'chokidar',
    'diff',
    'drizzle-orm',
    'fzy.js',
    'gray-matter',
    'immer',
    'isbinaryfile',
    'ignore',
    'superjson',
    'pdfjs-dist',
    'pdfjs-dist/legacy/build/pdf.mjs',
    'sharp',
    'web-tree-sitter',
    '@vscode/tree-sitter-wasm',
    'xml',
    'yauzl',
    'zod',
  ],
  loader: { '.ts': 'ts', '.sql': 'text', '.md': 'text' },
});

console.log('Generating TypeScript declarations...');
execSync('tsc --emitDeclarationOnly --outDir dist', { stdio: 'inherit' });

console.log('Build complete.');
