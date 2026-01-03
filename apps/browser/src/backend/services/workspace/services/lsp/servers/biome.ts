import { spawn } from 'node:child_process';
import type { LspServerInfo, LspServerHandle } from '../types';
import { BIOME_EXTENSIONS } from '../language-map';
import { hasAnyFile, findNodeModulesBin } from './utils/root-finder';

/**
 * Biome Language Server definition
 *
 * Resolution order:
 * 1. Project's @biomejs/biome from node_modules
 * 2. npx @biomejs/biome (global/fallback)
 *
 * Only activates if biome.json or biome.jsonc exists.
 */
export const biomeServer: LspServerInfo = {
  id: 'biome',
  name: 'Biome Language Server',
  extensions: BIOME_EXTENSIONS,

  async shouldActivate(projectRoot: string): Promise<boolean> {
    // Only activate if biome config exists
    return hasAnyFile(projectRoot, ['biome.json', 'biome.jsonc']);
  },

  async spawn(projectRoot: string): Promise<LspServerHandle | undefined> {
    // Try project's biome first
    const localBin = await findNodeModulesBin(projectRoot, 'biome');
    if (localBin) return spawnBiomeServer(localBin, projectRoot);
    // Try npx fallback
    return spawnViaNpx(projectRoot);
  },
};

function spawnBiomeServer(binary: string, root: string): LspServerHandle {
  const process = spawn(binary, ['lsp-proxy'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: root,
    env: globalThis.process.env,
  });

  return { process };
}

async function spawnViaNpx(root: string): Promise<LspServerHandle | undefined> {
  try {
    const process = spawn('npx', ['@biomejs/biome', 'lsp-proxy'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: root,
      env: globalThis.process.env,
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
