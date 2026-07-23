import type { MountEntry } from '@shared/karton-contracts/ui';
import { getBaseName, normalizePath } from '@shared/path-utils';

export function getWorkspaceLocation(cwd: string, mounts: MountEntry[]) {
  const normalizedCwd = normalizePath(cwd).replace(/\/$/, '');
  let closestMount: MountEntry | undefined;

  for (const mount of mounts) {
    const mountPath = normalizePath(mount.path).replace(/\/$/, '');
    if (
      (normalizedCwd === mountPath ||
        normalizedCwd.startsWith(`${mountPath}/`)) &&
      (!closestMount || mountPath.length > closestMount.path.length)
    ) {
      closestMount = mount;
    }
  }

  if (!closestMount?.git) {
    return { isGit: false, name: cwd, detail: null };
  }

  const repoPath =
    closestMount.git.mainWorktreePath ?? closestMount.git.repoRoot;
  return {
    isGit: true,
    name: getBaseName(repoPath) || repoPath,
    detail:
      closestMount.git.branch ?? closestMount.git.headSha?.slice(0, 7) ?? null,
  };
}
