import { spawn } from 'node:child_process';
import * as path from 'node:path';
import type { LspServerInfo, LspServerHandle } from '../types';
import { TYPESCRIPT_EXTENSIONS } from '../language-map';
import {
  hasAnyFile,
  findNodeModulesBin,
  getPackagePath,
  fileExists,
} from './utils/root-finder';

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

  async spawn(projectRoot: string): Promise<LspServerHandle | undefined> {
    // Try project's typescript-language-server first
    const localBin = await findNodeModulesBin(
      projectRoot,
      'typescript-language-server',
    );

    if (localBin) {
      const tsLib = await findTypeScriptLib(projectRoot);
      return spawnTsServer(localBin, [], tsLib);
    }

    // Try npx fallback
    return spawnViaNpx(projectRoot);
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
): LspServerHandle {
  const spawnArgs = ['--stdio', ...args];

  const process = spawn(binary, spawnArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...globalThis.process.env,
      NODE_OPTIONS: '--max-old-space-size=4096',
    },
  });

  return {
    process,
    initializationOptions: tsLibPath
      ? { typescript: { tsdk: tsLibPath } }
      : undefined,
  };
}

async function spawnViaNpx(root: string): Promise<LspServerHandle | undefined> {
  try {
    const process = spawn('npx', ['typescript-language-server', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: root,
      env: {
        ...globalThis.process.env,
        NODE_OPTIONS: '--max-old-space-size=4096',
      },
    });

    return new Promise((resolve) => {
      let resolved = false;

      process.on('error', () => {
        if (!resolved) {
          resolved = true;
          resolve(undefined);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ process });
        }
      }, 100);
    });
  } catch {
    return undefined;
  }
}
