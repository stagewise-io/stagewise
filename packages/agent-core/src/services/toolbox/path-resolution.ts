import path from 'node:path';
import { PLANS_PREFIX } from '../../plans';
import { LOGS_PREFIX } from '../../logs';
import type {
  UniversalToolboxDeps,
  MountPermission,
  StaticMount,
} from './types';

export interface ResolvedToolPath {
  inputPath: string;
  mountPrefix: string;
  relativePath: string;
  mountRoot: string;
  absolutePath: string;
  permissions: readonly MountPermission[];
}

const READ_ONLY_PERMISSIONS: readonly MountPermission[] = ['read'];
const FULL_PERMISSIONS: readonly MountPermission[] = [
  'read',
  'write',
  'create',
  'delete',
];

function normalizeMountPath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\/+/, '');
}

function splitMountPath(value: string): {
  prefix: string;
  relativePath: string;
} {
  const normalized = normalizeMountPath(value);
  const [prefix, ...rest] = normalized.split('/');
  if (!prefix) throw new Error('Path must include a mount prefix');
  return { prefix, relativePath: rest.join('/') };
}

function hasPermission(
  permissions: readonly MountPermission[],
  permission: MountPermission,
): boolean {
  return permissions.includes(permission);
}

function assertInsideMount(absolutePath: string, mountRoot: string): void {
  const resolved = path.resolve(absolutePath);
  const root = path.resolve(mountRoot);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Path traversal not allowed');
  }
}

function getStaticMounts(deps: UniversalToolboxDeps): StaticMount[] {
  return [
    ...(deps.staticMounts ?? []),
    {
      prefix: PLANS_PREFIX,
      absolutePath: deps.hostPaths.plansDir(),
      permissions: FULL_PERMISSIONS,
    },
    {
      prefix: LOGS_PREFIX,
      absolutePath: deps.hostPaths.logsDir(),
      permissions: FULL_PERMISSIONS,
    },
    {
      prefix: 'apps',
      absolutePath: deps.hostPaths.agentAppsDir(deps.agentInstanceId),
      permissions: FULL_PERMISSIONS,
    },
    {
      prefix: 'att',
      absolutePath: deps.hostPaths.agentAttachmentsDir(deps.agentInstanceId),
      permissions: READ_ONLY_PERMISSIONS,
    },
    {
      prefix: 'shells',
      absolutePath: deps.hostPaths.agentShellLogsDir(deps.agentInstanceId),
      permissions: READ_ONLY_PERMISSIONS,
    },
    {
      prefix: 'plugins',
      absolutePath: deps.hostPaths.pluginsDir(),
      permissions: READ_ONLY_PERMISSIONS,
    },
  ];
}

export function listAvailableMountPrefixes(
  deps: UniversalToolboxDeps,
): string[] {
  const prefixes = new Set<string>();
  for (const mount of getStaticMounts(deps)) prefixes.add(mount.prefix);
  for (const prefix of deps.mountManager?.getMountPrefixes(
    deps.agentInstanceId,
  ) ?? []) {
    prefixes.add(prefix);
  }
  return [...prefixes].sort();
}

export function resolveToolPath(
  deps: UniversalToolboxDeps,
  inputPath: string,
  permission: MountPermission = 'read',
): ResolvedToolPath {
  const { prefix, relativePath } = splitMountPath(inputPath);

  const staticMount = getStaticMounts(deps).find((m) => m.prefix === prefix);
  const workspaceRoot = deps.mountManager?.getWorkspacePathForPrefix(prefix);
  const mountRoot = staticMount?.absolutePath ?? workspaceRoot;
  const permissions = staticMount?.permissions ?? FULL_PERMISSIONS;

  if (!mountRoot) {
    throw new Error(
      `Mount ${prefix} not found. Available mounts: ${listAvailableMountPrefixes(deps).join(', ')}`,
    );
  }

  if (!hasPermission(permissions, permission)) {
    throw new Error(
      `Mount ${prefix} is read-only or does not allow ${permission}`,
    );
  }

  const absolutePath = path.resolve(mountRoot, relativePath);
  assertInsideMount(absolutePath, mountRoot);

  return {
    inputPath,
    mountPrefix: prefix,
    relativePath,
    mountRoot: path.resolve(mountRoot),
    absolutePath,
    permissions,
  };
}

export function findWorkspaceRootForPath(
  deps: UniversalToolboxDeps,
  absolutePath: string,
): string | null {
  return (
    deps.mountManager?.findWorkspaceForFile(
      deps.agentInstanceId,
      absolutePath,
    ) ?? null
  );
}
