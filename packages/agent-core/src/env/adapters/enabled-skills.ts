/**
 * `enabledSkills` core {@link DomainAdapter}.
 *
 * Owns the list of skill paths the agent can invoke. Pulls the
 * resolved-and-filtered roster from {@link AgentHost.environmentSources}.
 * The full-state render is the `<available_skills>` block of `<skill>`
 * elements embedded in every system prompt; the diff render reports
 * skill-enabled/skill-disabled events.
 *
 * Note: `<skill>` elements emit `name`/`description` based on host
 * metadata that is NOT part of the persisted `state`. The keyframe
 * render is therefore a function of `state` plus a live lookup; when
 * the host is offline (e.g. legacy resume), the path is rendered alone
 * with empty `name`/`description`. This matches the pre-Phase-4
 * renderer behavior.
 */
import type { AgentHost } from '../../host/host';
import type { DomainAdapter } from '../contract';
import type { SkillInfo } from '../skills';
import type { EnabledSkillsSnapshot } from '../types';
import {
  CORE_ENV_SCHEMA_VERSION,
  type EnvironmentChangeEntry,
  escAttr,
  renderChangesXml,
} from './shared';
import EnabledSkillsPromptSection from './enabled-skills.prompt.md?raw';

export interface EnabledSkillsDomainAdapterDeps {
  host: AgentHost;
  /**
   * Optional lookup for the rich {@link SkillInfo} metadata (name +
   * description) used in the full-state render. When omitted, paths
   * render with empty name/description fields.
   */
  getSkillDetails?: (
    agentInstanceId: string,
  ) => Promise<Map<string, SkillInfo>> | Map<string, SkillInfo>;
  renderOrder?: number;
}

async function buildEnabledSkillsState(
  agentInstanceId: string,
  host: AgentHost,
): Promise<EnabledSkillsSnapshot> {
  const sources = host.environmentSources;
  if (!sources) return { paths: [] };
  const skills = await sources.getResolvedSkillsForAgent(agentInstanceId);
  const paths = skills
    .filter((s) => s.agentInvocable !== false && !!s.skillPath)
    .map((s) => s.skillPath as string);
  return { paths };
}

function renderFullEnabledSkills(
  state: EnabledSkillsSnapshot,
  details: Map<string, SkillInfo> | undefined,
): string {
  if (state.paths.length === 0) return '';
  const lines = state.paths.map((path) => {
    const detail = details?.get(path);
    const name = detail?.name ?? path;
    const description = detail?.description ?? '';
    return `<skill name="${escAttr(name)}" description="${escAttr(description)}" path="${escAttr(path)}" />`;
  });
  return `<available_skills>\n${lines.join('\n')}\n</available_skills>`;
}

function computeEnabledSkillsChanges(
  previous: EnabledSkillsSnapshot,
  current: EnabledSkillsSnapshot,
): EnvironmentChangeEntry[] {
  const prevSet = new Set(previous.paths);
  const currSet = new Set(current.paths);
  const changes: EnvironmentChangeEntry[] = [];
  for (const p of currSet) {
    if (!prevSet.has(p)) {
      changes.push({ type: 'skill-enabled', attributes: { path: p } });
    }
  }
  for (const p of prevSet) {
    if (!currSet.has(p)) {
      changes.push({ type: 'skill-disabled', attributes: { path: p } });
    }
  }
  return changes;
}

export function createEnabledSkillsDomainAdapter(
  deps: EnabledSkillsDomainAdapterDeps,
): DomainAdapter<EnabledSkillsSnapshot> {
  // Late-bound lookup snapshot captured at `getState` time so
  // `renderState` (which is sync) sees consistent metadata for the
  // turn. Cleared when `getState` runs to keep memory bounded.
  let detailsForCurrentTurn: Map<string, SkillInfo> | undefined;
  return {
    domainId: 'enabledSkills',
    renderOrder: deps.renderOrder ?? 3,
    schemaVersion: CORE_ENV_SCHEMA_VERSION,
    promptSection: EnabledSkillsPromptSection,
    async getState(agentInstanceId) {
      const state = await buildEnabledSkillsState(agentInstanceId, deps.host);
      if (deps.getSkillDetails) {
        detailsForCurrentTurn = await deps.getSkillDetails(agentInstanceId);
      } else {
        detailsForCurrentTurn = undefined;
      }
      return state;
    },
    renderState(prev, curr) {
      if (prev === null) {
        return renderFullEnabledSkills(curr, detailsForCurrentTurn);
      }
      return renderChangesXml(computeEnabledSkillsChanges(prev, curr));
    },
  };
}
