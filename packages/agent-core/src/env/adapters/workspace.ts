/**
 * `workspace` core {@link DomainAdapter}.
 *
 * Owns the workspace-mount manifest. Reads workspace mounts from the
 * `MountManager` and decorates them with the always-available system
 * mounts (`att/`, `shells/`, `plugins/`, global-skills, `apps/`,
 * `plans/`, `logs/`) sourced from `AgentHost`. The full-state render
 * is the canonical `<symlinks>` table embedded in every system prompt;
 * the diff render reports mounted/unmounted/permission-change events.
 */
import type { AgentHost } from '../../host/host';
import type { MountManager } from '../../services/mount-manager/mount-registry';
import type { DomainAdapter } from '../contract';
import { FULL_PERMISSIONS, READ_ONLY_PERMISSIONS } from '../permissions';
import type { Mount, MountPermission, WorkspaceSnapshot } from '../types';
import {
  CORE_ENV_SCHEMA_VERSION,
  type EnvironmentChangeEntry,
  renderChangesXml,
} from './shared';
import WorkspacePromptSection from './workspace.prompt.md?raw';

export interface WorkspaceDomainAdapterDeps {
  host: AgentHost;
  mountManager: MountManager;
  renderOrder?: number;
}

const SYSTEM_PREFIXES = new Set(['att', 'plugins', 'apps', 'shells']);

function isSystemMount(prefix: string): boolean {
  return SYSTEM_PREFIXES.has(prefix) || prefix.startsWith('globalskills-');
}

function buildWorkspaceState(
  agentInstanceId: string,
  host: AgentHost,
  mountManager: MountManager,
): WorkspaceSnapshot {
  const workspaceMounts =
    mountManager.getWorkspaceSnapshot(agentInstanceId).mounts;

  const ro = [...READ_ONLY_PERMISSIONS] as MountPermission[];
  const full = [...FULL_PERMISSIONS] as MountPermission[];

  const mounts: Mount[] = [
    ...workspaceMounts,
    {
      prefix: 'att',
      path: host.paths.agentAttachmentsDir(agentInstanceId),
      permissions: ro,
    },
    {
      prefix: 'shells',
      path: host.paths.agentShellLogsDir(agentInstanceId),
      permissions: ro,
    },
    { prefix: 'plugins', path: host.paths.pluginsDir(), permissions: ro },
    ...(host.environmentSources?.getGlobalSkillsMounts() ?? [])
      .filter((gs) => gs.exists)
      .map(
        (gs): Mount => ({
          prefix: gs.prefix,
          path: gs.absolutePath,
          permissions: ro,
        }),
      ),
    {
      prefix: 'apps',
      path: host.paths.agentAppsDir(agentInstanceId),
      permissions: full,
    },
    { prefix: 'plans', path: host.paths.plansDir(), permissions: full },
    { prefix: 'logs', path: host.paths.logsDir(), permissions: full },
  ];

  return { mounts };
}

function renderFullSymlinks(state: WorkspaceSnapshot): string {
  const userMounts = state.mounts.filter((m) => !isSystemMount(m.prefix));
  const systemMounts = state.mounts.filter((m) => isSystemMount(m.prefix));
  const allMounts = [...userMounts, ...systemMounts];
  if (allMounts.length === 0) {
    return '<symlinks>No symlinks available.</symlinks>';
  }
  const rows = allMounts.map((m) => {
    const isUser = !isSystemMount(m.prefix);
    const addr = isUser ? `use '${m.prefix}/...' to address files` : '';
    const perms = m.permissions ? m.permissions.join(', ') : '';
    return `| ${m.prefix} | ${m.path} | ${addr} | ${perms} |`;
  });
  const table = [
    '| prefix | path | notes | permissions |',
    '|--------|------|-------|-------------|',
    ...rows,
  ].join('\n');
  return `<symlinks>\n${table}\n</symlinks>`;
}

function computeWorkspaceChanges(
  previous: WorkspaceSnapshot,
  current: WorkspaceSnapshot,
): EnvironmentChangeEntry[] {
  const changes: EnvironmentChangeEntry[] = [];

  const prevMap = new Map(previous.mounts.map((m) => [m.prefix, m]));
  const currMap = new Map(current.mounts.map((m) => [m.prefix, m]));

  for (const [prefix, mount] of currMap) {
    const prev = prevMap.get(prefix);
    if (!prev) {
      changes.push({
        type: 'workspace-mounted',
        attributes: { prefix, path: mount.path },
      });
    } else if (prev.path !== mount.path) {
      changes.push({
        type: 'workspace-path-changed',
        attributes: { prefix, from: prev.path, to: mount.path },
      });
    } else {
      const prevPerms = (prev.permissions ?? []).join(',');
      const currPerms = (mount.permissions ?? []).join(',');
      if (prevPerms !== currPerms) {
        changes.push({
          type: 'workspace-permissions-changed',
          attributes: { prefix, from: prevPerms, to: currPerms },
        });
      }
    }
  }

  for (const [prefix, mount] of prevMap) {
    if (!currMap.has(prefix)) {
      changes.push({
        type: 'workspace-unmounted',
        attributes: { prefix, path: mount.path },
      });
    }
  }

  return changes;
}

/** Stable env-domain id for the workspace adapter. */
export const WORKSPACE_DOMAIN_ID = 'workspace';

export function createWorkspaceDomainAdapter(
  deps: WorkspaceDomainAdapterDeps,
): DomainAdapter<WorkspaceSnapshot> {
  return {
    domainId: WORKSPACE_DOMAIN_ID,
    renderOrder: deps.renderOrder ?? 1,
    schemaVersion: CORE_ENV_SCHEMA_VERSION,
    promptSection: WorkspacePromptSection,
    getState(agentInstanceId) {
      return buildWorkspaceState(agentInstanceId, deps.host, deps.mountManager);
    },
    renderState(prev, curr) {
      if (prev === null) return renderFullSymlinks(curr);
      return renderChangesXml(computeWorkspaceChanges(prev, curr));
    },
  };
}
