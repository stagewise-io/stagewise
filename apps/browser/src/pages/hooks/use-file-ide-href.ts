import { useCallback } from 'react';
import { useKartonState } from '@pages/hooks/use-karton';
import { stripMountPrefix } from '@ui/utils';
import { normalizePath } from '@shared/path-utils';
import type { WorkspaceMountInfo } from '@shared/karton-contracts/pages-api';
import { useFileIDEHref as useFileIDEHrefBase } from '@shared/hooks/use-file-ide-href';

function resolveAbsolutePath(
  mountPrefixedPath: string,
  workspaceMounts: WorkspaceMountInfo[],
): string | null {
  if (workspaceMounts.length === 0) return null;
  const relativePath = stripMountPrefix(mountPrefixedPath);
  if (!relativePath) return null;
  const normalized = normalizePath(relativePath);
  if (normalized.startsWith('/')) return normalized;
  const basePath = normalizePath(workspaceMounts[0]!.path);
  return `${basePath}/${normalized}`;
}

function absoluteToRelative(
  absolutePath: string,
  workspaceMounts: WorkspaceMountInfo[],
): string | null {
  const normalized = normalizePath(absolutePath);
  if (!normalized.startsWith('/')) return normalized;
  for (const mount of workspaceMounts) {
    const mountRoot = normalizePath(mount.path);
    if (!normalized.startsWith(`${mountRoot}/`)) continue;
    return normalized.slice(mountRoot.length + 1);
  }
  return null;
}

export function useFileIDEHref() {
  const workspaceMounts = useKartonState((s) => s.workspaceMounts);

  const resolvePath = useCallback(
    (relativePath: string) =>
      resolveAbsolutePath(relativePath, workspaceMounts),
    [workspaceMounts],
  );

  const toRelativePath = useCallback(
    (absPath: string) => absoluteToRelative(absPath, workspaceMounts),
    [workspaceMounts],
  );

  return {
    ...useFileIDEHrefBase({
      resolvePath,
      ideConfig: { openFilesInIde: 'other' as const },
      setIdeConfig: async () => {},
    }),
    toRelativePath,
  };
}
