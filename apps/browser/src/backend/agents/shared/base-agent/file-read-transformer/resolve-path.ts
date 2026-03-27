/**
 * Resolves mount-prefixed paths (e.g. `"w1/src/app.tsx"`, `"att/img.png"`)
 * to absolute filesystem paths using the agent's mount registry.
 */

import nodePath from 'node:path';
import { getAgentAttachmentPath } from '@/utils/paths';

/**
 * Resolve a mount-prefixed path to an absolute filesystem path.
 *
 * Supports:
 * - `att/<key>` — agent data-attachment blob
 * - `<prefix>/<rel>` — workspace mount
 *
 * @param mountedPath — Mount-prefixed path (e.g. `"w1/src/app.tsx"`).
 * @param agentId — Current agent instance ID.
 * @param mountPaths — Map of mount prefix → absolute root path.
 * @returns Absolute filesystem path, or `null` if the mount is unknown.
 */
export function resolveMountedPath(
  mountedPath: string,
  agentId: string,
  mountPaths: Map<string, string>,
): string | null {
  if (mountedPath.startsWith('att/')) {
    const key = mountedPath.slice(4);
    if (!key) return null;
    return getAgentAttachmentPath(agentId, key);
  }

  const slashIdx = mountedPath.indexOf('/');

  if (slashIdx <= 0) {
    // No slash — bare mount prefix (e.g. "w1" from a workspace mention).
    // Treat as the mount root directory.
    const mountRoot = mountPaths.get(mountedPath);
    return mountRoot ?? null;
  }

  const prefix = mountedPath.slice(0, slashIdx);
  const relative = mountedPath.slice(slashIdx + 1);
  const mountRoot = mountPaths.get(prefix);
  if (!mountRoot) return null;

  return nodePath.join(mountRoot, relative);
}
