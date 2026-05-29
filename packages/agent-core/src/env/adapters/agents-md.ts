/**
 * `agentsMd` core {@link DomainAdapter}.
 *
 * Owns the `AGENTS.md` manifest for every workspace mount attached to
 * the agent. Reads contents from disk via `readAgentsMd` and intersects
 * with the host's `respectAgentsMd` per-workspace setting. The
 * full-state render is the `<file path=".../AGENTS.md" respected="...">`
 * blocks embedded in every system prompt; the diff render reports
 * created/updated/deleted entries and respected-flag flips, with unified
 * diffs in the `detail` body for content changes.
 */
import { createPatch } from 'diff';
import type { AgentHost } from '../../host/host';
import { prefixLineNumbers } from '../../file-read-transformer';
import {
  DEFAULT_WORKSPACE_MD_RELATIVE_PATH,
  readAgentsMd,
} from '../../services/mount-manager/workspace-info';
import type { MountManager } from '../../services/mount-manager/mount-registry';
import type { DomainAdapter } from '../contract';
import type { AgentsMdSnapshot } from '../types';
import {
  CORE_ENV_SCHEMA_VERSION,
  type EnvironmentChangeEntry,
  escAttr,
  renderChangesXml,
} from './shared';
import AgentsMdPromptSection from './agents-md.prompt.md?raw';

export interface AgentsMdDomainAdapterDeps {
  host: AgentHost;
  mountManager: MountManager;
  renderOrder?: number;
  /**
   * Mount-relative WORKSPACE.md path used to format the cross-link
   * inside the AGENTS.md prompt section. Sourced from
   * `AgentHost.workspaceMdRelativePath()`. Defaults to
   * `.stagewise/WORKSPACE.md`.
   */
  workspaceMdRelativePath?: string;
}

async function buildAgentsMdState(
  agentInstanceId: string,
  host: AgentHost,
  mountManager: MountManager,
): Promise<AgentsMdSnapshot> {
  const prefixes = mountManager.getMountPrefixes(agentInstanceId) ?? [];
  if (prefixes.length === 0) return { entries: [], respectedMounts: [] };

  const settings =
    host.environmentSources?.getWorkspaceAgentSettings(agentInstanceId) ??
    new Map();

  const entries: Array<{ mountPrefix: string; content: string }> = [];
  const respectedMounts: string[] = [];

  await Promise.all(
    prefixes.map(async (prefix) => {
      const workspacePath = mountManager.getWorkspacePathForPrefix(prefix);
      if (!workspacePath) return;
      const content = await readAgentsMd(workspacePath);
      if (content) entries.push({ mountPrefix: prefix, content });

      const workspaceSetting = settings.get(workspacePath);
      if (workspaceSetting?.respectAgentsMd) respectedMounts.push(prefix);
    }),
  );

  entries.sort((a, b) => a.mountPrefix.localeCompare(b.mountPrefix));
  respectedMounts.sort();

  return { entries, respectedMounts };
}

function renderFullAgentsMd(state: AgentsMdSnapshot): string {
  if (state.entries.length === 0) return '';
  const blocks = state.entries.map((entry) => {
    const respected = state.respectedMounts.includes(entry.mountPrefix);
    const body = prefixLineNumbers(entry.content);
    return `<file path="${escAttr(entry.mountPrefix)}/AGENTS.md" respected="${respected}">
<metadata>language:markdown</metadata>
<content>
${body}
</content>
</file>`;
  });
  return blocks.join('\n');
}

function computeAgentsMdChanges(
  previous: AgentsMdSnapshot,
  current: AgentsMdSnapshot,
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
        type: 'agents-md-created',
        detail: currContent,
        attributes: { path: prefix },
      });
    } else if (prevContent !== currContent) {
      const diff = createPatch(
        `${prefix}/AGENTS.md`,
        prevContent,
        currContent,
        '',
        '',
        { context: 3 },
      );
      changes.push({
        type: 'agents-md-updated',
        detail: diff,
        attributes: { path: prefix },
      });
    }
  }

  for (const [prefix] of prevEntries) {
    if (!currEntries.has(prefix)) {
      changes.push({
        type: 'agents-md-deleted',
        attributes: { path: prefix },
      });
    }
  }

  const prevRespected = new Set(previous.respectedMounts);
  const currRespected = new Set(current.respectedMounts);
  for (const mount of currRespected) {
    if (!prevRespected.has(mount)) {
      changes.push({
        type: 'agents-md-enabled',
        attributes: { path: mount },
      });
    }
  }
  for (const mount of prevRespected) {
    if (!currRespected.has(mount)) {
      changes.push({
        type: 'agents-md-disabled',
        attributes: { path: mount },
      });
    }
  }

  return changes;
}

export function createAgentsMdDomainAdapter(
  deps: AgentsMdDomainAdapterDeps,
): DomainAdapter<AgentsMdSnapshot> {
  const relativePath =
    deps.workspaceMdRelativePath ?? DEFAULT_WORKSPACE_MD_RELATIVE_PATH;
  const promptSection = AgentsMdPromptSection.replaceAll(
    '{workspaceMdRelativePath}',
    relativePath,
  );
  return {
    domainId: 'agentsMd',
    renderOrder: deps.renderOrder ?? 4,
    schemaVersion: CORE_ENV_SCHEMA_VERSION,
    promptSection,
    getState(agentInstanceId) {
      return buildAgentsMdState(agentInstanceId, deps.host, deps.mountManager);
    },
    renderState(prev, curr) {
      if (prev === null) return renderFullAgentsMd(curr);
      return renderChangesXml(computeAgentsMdChanges(prev, curr));
    },
  };
}
