/**
 * Unit tests for the `workspace` core {@link DomainAdapter}. Covers
 * both render modes (`prev === null` = full keyframe; `prev !== null`
 * = diff) and the system-mount decoration that the adapter performs.
 */
import { describe, expect, it } from 'vitest';
import { createWorkspaceDomainAdapter } from './workspace';
import { CORE_ENV_SCHEMA_VERSION } from './shared';
import type { AgentHost } from '../../host/host';
import type { HostPaths } from '../../host/paths';
import { createTestAgentHost } from '../../host/test-utils';
import type { MountManager } from '../../services/mount-manager/mount-registry';

function makeHost(): AgentHost {
  const p = (name: string) => () => `/host/${name}`;
  const paths: HostPaths = {
    agentAttachmentsDir: (id: string) => `/host/att/${id}`,
    agentShellLogsDir: (id: string) => `/host/shells/${id}`,
    pluginsDir: () => '/host/plugins',
    agentAppsDir: (id: string) => `/host/apps/${id}`,
    plansDir: p('plans'),
    logsDir: p('logs'),
    // Unused fields:
    dataDir: p('data'),
    tempDir: p('tmp'),
    agentsDir: p('agents'),
    agentDir: () => '/host/agent',
    agentAttachmentPath: () => '/host/att-file',
    diffHistoryDir: p('diff'),
    diffHistoryDbPath: () => '/host/diff.db',
    diffHistoryBlobsDir: () => '/host/diff-blobs',
    agentDbPath: () => '/host/agent.db',
    fileReadCacheDbPath: () => '/host/frc.db',
    processedImageCacheDbPath: () => '/host/pic.db',
    userDataDir: p('udata'),
    builtinSkillsDir: p('builtin'),
    ripgrepBaseDir: p('rg'),
  };
  return createTestAgentHost({ paths });
}

function makeMountManager(
  workspaceMounts: Array<{
    prefix: string;
    path: string;
    permissions?: ('read' | 'list' | 'create' | 'edit' | 'delete')[];
  }>,
): MountManager {
  return {
    getWorkspaceSnapshot: () => ({ mounts: workspaceMounts }),
  } as unknown as MountManager;
}

describe('createWorkspaceDomainAdapter', () => {
  it('reports the canonical contract metadata', () => {
    const adapter = createWorkspaceDomainAdapter({
      host: makeHost(),
      mountManager: makeMountManager([]),
    });
    expect(adapter.domainId).toBe('workspace');
    expect(adapter.renderOrder).toBe(1);
    expect(adapter.schemaVersion).toBe(CORE_ENV_SCHEMA_VERSION);
  });

  it('decorates user mounts with built-in system mounts in renderState', () => {
    const adapter = createWorkspaceDomainAdapter({
      host: makeHost(),
      mountManager: makeMountManager([
        { prefix: 'wA', path: '/abs/A', permissions: ['read', 'list'] },
      ]),
    });
    const curr = adapter.getState('a1') as never;
    const full = adapter.renderState(null, curr);
    expect(full).toContain('<symlinks>');
    expect(full).toContain('| wA | /abs/A | ');
    // System prefixes (att, shells, plugins, apps, plans, logs)
    expect(full).toContain('| att |');
    expect(full).toContain('| shells |');
    expect(full).toContain('| plugins |');
    expect(full).toContain('| apps |');
    expect(full).toContain('| plans |');
    expect(full).toContain('| logs |');
  });

  it('emits workspace-mounted on the diff render', () => {
    const adapter = createWorkspaceDomainAdapter({
      host: makeHost(),
      mountManager: makeMountManager([
        { prefix: 'wB', path: '/abs/B', permissions: ['read'] },
      ]),
    });
    const curr = adapter.getState('a1') as never;
    const prev = { mounts: [] } as never;
    const diff = adapter.renderState(prev, curr);
    expect(diff).toContain('workspace-mounted');
    expect(diff).toContain('prefix="wB"');
  });

  it('returns empty diff string when state is unchanged', () => {
    const adapter = createWorkspaceDomainAdapter({
      host: makeHost(),
      mountManager: makeMountManager([
        { prefix: 'wA', path: '/abs/A', permissions: ['read'] },
      ]),
    });
    const curr = adapter.getState('a1') as never;
    const diff = adapter.renderState(curr, curr);
    expect(diff).toBe('');
  });

  it('exposes a non-empty promptSection covering workspace-relevant keywords', () => {
    const adapter = createWorkspaceDomainAdapter({
      host: makeHost(),
      mountManager: makeMountManager([]),
    });
    expect(adapter.promptSection).toBeTruthy();
    const section = adapter.promptSection ?? '';
    expect(section).toContain('symlink');
    expect(section).toContain('workspace');
  });
});
