import type { LspServerInfo, LspServerHandle } from '../types';
import { BIOME_EXTENSIONS } from '../language-map';
import { hasAnyFile, findNodeModulesBin } from './utils/root-finder';
import { spawnStdioLspServer } from './utils/spawn-helpers';

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

  async spawn(
    projectRoot: string,
    resolvedEnv?: Record<string, string> | null,
  ): Promise<LspServerHandle | undefined> {
    const env = resolvedEnv ?? globalThis.process.env;

    // Try project's biome first
    const localBin = await findNodeModulesBin(projectRoot, 'biome');
    if (localBin) return spawnBiomeServer(localBin, projectRoot, env);
    // Try npx fallback
    return spawnViaNpx(projectRoot, env);
  },
};

function spawnBiomeServer(
  binary: string,
  root: string,
  env: Record<string, string> | NodeJS.ProcessEnv,
): Promise<LspServerHandle | undefined> {
  return spawnStdioLspServer(binary, ['lsp-proxy'], {
    cwd: root,
    env,
  });
}

function spawnViaNpx(
  root: string,
  env: Record<string, string> | NodeJS.ProcessEnv,
): Promise<LspServerHandle | undefined> {
  return spawnStdioLspServer('npx', ['@biomejs/biome', 'lsp-proxy'], {
    cwd: root,
    env,
  });
}
