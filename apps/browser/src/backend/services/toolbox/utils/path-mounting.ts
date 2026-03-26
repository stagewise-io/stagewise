import type { MountedClientRuntimes, MountedLspServices } from '.';
import type { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import type { LspService } from '../services/lsp';
import { normalizePath } from '@shared/path-utils';

/**
 * Resolve the client runtime and the relative path from a mounted relative path
 * @param mountedRuntimes - the mounted client runtimes
 * @param relativePathWithMountPrefix - the relative path with the mount prefix
 * @returns the client runtime and the relative path
 */
export function resolveMountedRelativePath(
  mountedRuntimes: MountedClientRuntimes,
  relativePathWithMountPrefix: string,
): { clientRuntime: ClientRuntimeNode; path: string } {
  const normalized = normalizePath(relativePathWithMountPrefix);
  const [mountPrefix, ...pathParts] = normalized.split('/');
  const clientRuntime = mountedRuntimes.get(mountPrefix);
  if (!clientRuntime)
    throw new Error(
      `Mount ${mountPrefix} not found. Available mounts: ${Array.from(mountedRuntimes.keys()).join(', ')}`,
    );
  return { clientRuntime, path: pathParts.join('/') };
}

export function resolveMountedLspService(
  mountedLspServices: MountedLspServices,
  relativePathWithMountPrefix: string,
): { lspService: LspService; path: string } {
  const normalized = normalizePath(relativePathWithMountPrefix);
  const [mountPrefix, ...pathParts] = normalized.split('/');
  const lspService = mountedLspServices.get(mountPrefix);
  if (!lspService)
    throw new Error(
      `Mount ${mountPrefix} not found. Available mounts: ${Array.from(mountedLspServices.keys()).join(', ')}`,
    );
  return { lspService, path: pathParts.join('/') };
}
