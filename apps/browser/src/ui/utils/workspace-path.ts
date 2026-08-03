import { normalizePath } from '@shared/path-utils';

type WorkspacePathMount = {
  path: string;
};

export function resolveWorkspaceFileLocation<T extends WorkspacePathMount>(
  path: string,
  mounts: readonly T[],
): { mount: T; relativePath: string } | null {
  const normalizedPath = normalizePath(path);
  let bestMatch: { mount: T; root: string } | null = null;

  for (const mount of mounts) {
    const root = normalizePath(mount.path).replace(/\/$/, '');
    if (
      (normalizedPath === root || normalizedPath.startsWith(`${root}/`)) &&
      (!bestMatch || root.length > bestMatch.root.length)
    ) {
      bestMatch = { mount, root };
    }
  }

  if (!bestMatch) return null;
  return {
    mount: bestMatch.mount,
    relativePath: normalizedPath
      .slice(bestMatch.root.length)
      .replace(/^\/+/, ''),
  };
}
