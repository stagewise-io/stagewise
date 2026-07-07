import * as path from 'node:path';
import type { LspServerInfo, LspServerHandle } from '../types';
import { TYPESCRIPT_EXTENSIONS } from '../language-map';
import {
  hasAnyFile,
  findNodeModulesBin,
  getPackagePath,
  fileExists,
} from './utils/root-finder';
import { spawnStdioLspServer } from './utils/spawn-helpers';

/**
 * TypeScript Language Server definition
 *
 * Resolution order:
 * 1. Project's typescript-language-server from node_modules
 * 2. npx typescript-language-server (global/fallback)
 */
export const typescriptServer: LspServerInfo = {
  id: 'typescript',
  name: 'TypeScript Language Server',
  extensions: TYPESCRIPT_EXTENSIONS,

  async shouldActivate(projectRoot: string): Promise<boolean> {
    // Activate for any JS/TS project (has package.json, tsconfig, or jsconfig)
    return hasAnyFile(projectRoot, [
      'tsconfig.json',
      'jsconfig.json',
      'package.json',
    ]);
  },

  async spawn(
    projectRoot: string,
    resolvedEnv?: Record<string, string> | null,
  ): Promise<LspServerHandle | undefined> {
    const env = resolvedEnv ?? globalThis.process.env;

    // Try project's typescript-language-server first
    const localBin = await findNodeModulesBin(
      projectRoot,
      'typescript-language-server',
    );

    if (localBin) {
      const tsLib = await findTypeScriptLib(projectRoot);
      return spawnTsServer(localBin, [], tsLib, env);
    }

    // Try npx fallback
    return spawnViaNpx(projectRoot, env);
  },
};

async function findTypeScriptLib(root: string): Promise<string | undefined> {
  const tsPath = await getPackagePath(root, 'typescript');
  if (tsPath) {
    const libPath = path.join(tsPath, 'lib');
    if (await fileExists(libPath)) return libPath;
  }
  return undefined;
}

function spawnTsServer(
  binary: string,
  args: string[],
  tsLibPath?: string,
  env?: Record<string, string> | NodeJS.ProcessEnv,
): Promise<LspServerHandle | undefined> {
  const spawnArgs = ['--stdio', ...args];

  return spawnStdioLspServer(binary, spawnArgs, {
    cwd: process.cwd(),
    env: {
      ...(env ?? globalThis.process.env),
      NODE_OPTIONS: '--max-old-space-size=4096',
    },
    initializationOptions: tsLibPath
      ? { typescript: { tsdk: tsLibPath } }
      : undefined,
  });
}

function spawnViaNpx(
  root: string,
  env?: Record<string, string> | NodeJS.ProcessEnv,
): Promise<LspServerHandle | undefined> {
  return spawnStdioLspServer('npx', ['typescript-language-server', '--stdio'], {
    cwd: root,
    env: {
      ...(env ?? globalThis.process.env),
      NODE_OPTIONS: '--max-old-space-size=4096',
    },
  });
}
