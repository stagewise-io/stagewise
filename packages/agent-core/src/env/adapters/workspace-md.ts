/**
 * `workspaceMd` core {@link DomainAdapter}.
 *
 * Owns the WORKSPACE.md manifest for every workspace mount attached to
 * the agent. The full-state render is the `<file path=".../WORKSPACE.md">`
 * blocks; the diff render reports created/updated/deleted entries with
 * unified diffs in the detail body.
 *
 * The mount-relative path (default `.stagewise/WORKSPACE.md`) is
 * sourced from `AgentHost.workspaceMdRelativePath()` via
 * `WorkspaceMdDomainAdapterDeps`.
 */
import { createPatch } from 'diff';
import { prefixLineNumbers } from '../../file-read-transformer';
import type { MountManager } from '../../services/mount-manager/mount-registry';
import {
  DEFAULT_WORKSPACE_MD_RELATIVE_PATH,
  readWorkspaceMd,
} from '../../services/mount-manager/workspace-info';
import type { DomainAdapter } from '../contract';
import type { WorkspaceMdSnapshot } from '../types';
import {
  CORE_ENV_SCHEMA_VERSION,
  type EnvironmentChangeEntry,
  escAttr,
  renderChangesXml,
} from './shared';
import WorkspaceMdPromptSection from './workspace-md.prompt.md?raw';

export interface WorkspaceMdDomainAdapterDeps {
  mountManager: MountManager;
  renderOrder?: number;
  /**
   * Mount-relative WORKSPACE.md path, sourced from
   * `AgentHost.workspaceMdRelativePath()`. Defaults to
   * `.stagewise/WORKSPACE.md`.
   */
  workspaceMdRelativePath?: string;
}

async function buildWorkspaceMdState(
  agentInstanceId: string,
  mountManager: MountManager,
  relativePath: string,
): Promise<WorkspaceMdSnapshot> {
  const prefixes = mountManager.getMountPrefixes(agentInstanceId) ?? [];
  if (prefixes.length === 0) return { entries: [] };

  const entries: Array<{ mountPrefix: string; content: string }> = [];
  await Promise.all(
    prefixes.map(async (prefix) => {
      const workspacePath = mountManager.getWorkspacePathForPrefix(prefix);
      if (!workspacePath) return;
      const content = await readWorkspaceMd(workspacePath, relativePath);
      if (content) entries.push({ mountPrefix: prefix, content });
    }),
  );
  entries.sort((a, b) => a.mountPrefix.localeCompare(b.mountPrefix));
  return { entries };
}

function renderFullWorkspaceMd(
  state: WorkspaceMdSnapshot,
  relativePath: string,
): string {
  if (state.entries.length === 0) return '';
  const blocks = state.entries.map((entry) => {
    const body = prefixLineNumbers(entry.content);
    return `<file path="${escAttr(entry.mountPrefix)}/${escAttr(relativePath)}">
<metadata>language:markdown</metadata>
<content>
${body}
</content>
</file>`;
  });
  return blocks.join('\n');
}

function computeWorkspaceMdChanges(
  previous: WorkspaceMdSnapshot,
  current: WorkspaceMdSnapshot,
  relativePath: string,
): EnvironmentChangeEntry[] {
  const changes: EnvironmentChangeEntry[] = [];
  const prevEntries = new Map(
    previous.entries.map((e) => [e.mountPrefix, e.content]),
  );
  const currEntries = new Map(
    current.entries.map((e) => [e.mountPrefix, e.content]),
  );

  for (const [prefix, currContent] of currEntries) {
    const prevContent = prevEntries.get(prefix);
    if (prevContent === undefined) {
      changes.push({
        type: 'workspace-md-created',
        detail: currContent,
        attributes: { path: prefix },
      });
    } else if (prevContent !== currContent) {
      const diff = createPatch(
        `${prefix}/${relativePath}`,
        prevContent,
        currContent,
        '',
        '',
        { context: 3 },
      );
      changes.push({
        type: 'workspace-md-updated',
        detail: diff,
        attributes: { path: prefix },
      });
    }
  }

  for (const [prefix] of prevEntries) {
    if (!currEntries.has(prefix)) {
      changes.push({
        type: 'workspace-md-deleted',
        attributes: { path: prefix },
      });
    }
  }

  return changes;
}

/** Stable env-domain id for the workspace-md adapter. */
export const WORKSPACE_MD_DOMAIN_ID = 'workspaceMd';

export function createWorkspaceMdDomainAdapter(
  deps: WorkspaceMdDomainAdapterDeps,
): DomainAdapter<WorkspaceMdSnapshot> {
  const relativePath =
    deps.workspaceMdRelativePath ?? DEFAULT_WORKSPACE_MD_RELATIVE_PATH;
  const promptSection = WorkspaceMdPromptSection.replaceAll(
    '{workspaceMdRelativePath}',
    relativePath,
  );
  return {
    domainId: WORKSPACE_MD_DOMAIN_ID,
    renderOrder: deps.renderOrder ?? 5,
    schemaVersion: CORE_ENV_SCHEMA_VERSION,
    promptSection,
    getState(agentInstanceId) {
      return buildWorkspaceMdState(
        agentInstanceId,
        deps.mountManager,
        relativePath,
      );
    },
    renderState(prev, curr) {
      if (prev === null) return renderFullWorkspaceMd(curr, relativePath);
      return renderChangesXml(
        computeWorkspaceMdChanges(prev, curr, relativePath),
      );
    },
  };
}
