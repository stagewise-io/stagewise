import { useCallback, useMemo } from 'react';
import { useKartonState } from '@ui/hooks/use-karton';
import { useMountedPaths } from '@ui/hooks/use-mounted-paths';
import type { Mount } from '@shared/karton-contracts/ui/agent/metadata';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useFileIDEHref as useFileIDEHrefBase } from '@shared/hooks/use-file-ide-href';
import { normalizePath } from '@shared/path-utils';

function resolveAbsolutePath(
  relativeFilePath: string,
  mounts: Mount[],
): string | null {
  const normalized = normalizePath(relativeFilePath);
  if (normalized.startsWith('/')) return normalized;
  for (const mount of mounts) {
    if (!normalized.startsWith(`${mount.prefix}/`)) continue;
    const stripped = normalized.slice(mount.prefix.length + 1);
    return `${normalizePath(mount.path)}/${stripped}`;
  }
  if (mounts.length === 1)
    return `${normalizePath(mounts[0]?.path ?? '')}/${normalized}`;

  return null;
}

function absoluteToRelative(
  absolutePath: string,
  mounts: Mount[],
): string | null {
  const normalized = normalizePath(absolutePath);
  if (!normalized.startsWith('/')) return normalized;
  for (const mount of mounts) {
    const mountRoot = normalizePath(mount.path);
    if (!normalized.startsWith(`${mountRoot}/`)) continue;
    return normalized.slice(mountRoot.length + 1);
  }
  return null;
}

export function useFileIDEHref() {
  const historicalMounts = useMountedPaths();
  const [openAgentId] = useOpenAgent();
  const liveMounts = useKartonState((s) =>
    openAgentId ? (s.toolbox[openAgentId]?.workspace?.mounts ?? null) : null,
  );
  const mounts = useMemo(
    () =>
      (historicalMounts?.length ? historicalMounts : null) ?? liveMounts ?? [],
    [historicalMounts, liveMounts],
  );
  const resolvePath = useCallback(
    (relativePath: string) => resolveAbsolutePath(relativePath, mounts),
    [mounts],
  );

  const toRelativePath = useCallback(
    (absPath: string) => absoluteToRelative(absPath, mounts),
    [mounts],
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
