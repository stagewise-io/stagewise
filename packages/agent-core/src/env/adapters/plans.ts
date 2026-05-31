/**
 * `plans` core {@link DomainAdapter}.
 *
 * Owns the plan manifest for the agent — the union of plan files in
 * `plans/` that this agent has written to, as derived from message
 * history (`getAgentOwnedPlanPaths`). The full-state render is the
 * `<active_plans>` block embedded in every system prompt; the diff
 * render reports plan-added/plan-progress/plan-removed events.
 */
import type { AgentHost } from '../../host/host';
import { PLANS_PREFIX, getAgentOwnedPlanPaths } from '../../plans/ownership';
import { readPlans } from '../../plans/read';
import type { AgentStore } from '../../store/agent-store';
import type { DomainAdapter } from '../contract';
import type { PlansSnapshot } from '../types';
import {
  CORE_ENV_SCHEMA_VERSION,
  type EnvironmentChangeEntry,
  renderChangesXml,
} from './shared';
import PlansPromptSection from './plans.prompt.md?raw';

export interface PlansDomainAdapterDeps {
  host: AgentHost;
  store: AgentStore;
  renderOrder?: number;
}

type PlanEntry = PlansSnapshot['entries'][number];

async function buildPlansState(
  agentInstanceId: string,
  host: AgentHost,
  store: AgentStore,
): Promise<PlansSnapshot> {
  const agentEntry = store.get().agents.instances[agentInstanceId];
  const ownedPaths = agentEntry
    ? getAgentOwnedPlanPaths(agentEntry.state.history)
    : new Set<string>();
  if (ownedPaths.size === 0) return { entries: [] };

  const plans = await readPlans(host.paths.plansDir());
  const entries = plans.filter((plan) =>
    ownedPaths.has(`${PLANS_PREFIX}/${plan.filename}`),
  );
  return { entries };
}

function findNextTask(entry: PlanEntry): string | null {
  for (const group of entry.taskGroups) {
    for (const task of group.tasks) if (!task.completed) return task.text;
  }
  return null;
}

function renderFullPlans(state: PlansSnapshot): string {
  if (state.entries.length === 0) return '';
  const lines = state.entries.map((p) => {
    const progress = `${p.completedTasks}/${p.totalTasks}`;
    const file = `${PLANS_PREFIX}/${p.filename}`;
    const desc = p.description ? ` — ${p.description}` : '';
    const next = findNextTask(p);
    const nextLine = next
      ? `\n  Next TODO: ${next}`
      : '\n  All tasks complete.';
    return `- **${p.name}** (${progress})${desc}\n  File: \`${file}\`${nextLine}`;
  });
  return `<active_plans>\n${lines.join('\n')}\n</active_plans>`;
}

function nextTaskSuffix(entry: PlanEntry): string {
  const next = findNextTask(entry);
  return next ? `. Next: ${next}` : '. All tasks complete.';
}

function computePlansChanges(
  previous: PlansSnapshot,
  current: PlansSnapshot,
): EnvironmentChangeEntry[] {
  const changes: EnvironmentChangeEntry[] = [];
  const prevByKey = new Map(previous.entries.map((e) => [e.filename, e]));
  const currByKey = new Map(current.entries.map((e) => [e.filename, e]));

  for (const [key, curr] of currByKey) {
    const prev = prevByKey.get(key);
    if (!prev) {
      changes.push({
        type: 'plan-added',
        summary: `Plan "${curr.name}" added (${curr.completedTasks}/${curr.totalTasks} tasks)${nextTaskSuffix(curr)}`,
        attributes: { file: `${PLANS_PREFIX}/${curr.filename}` },
      });
    } else if (
      prev.completedTasks !== curr.completedTasks ||
      prev.totalTasks !== curr.totalTasks
    ) {
      changes.push({
        type: 'plan-progress',
        summary: `Plan "${curr.name}" progress: ${prev.completedTasks}/${prev.totalTasks} → ${curr.completedTasks}/${curr.totalTasks}${nextTaskSuffix(curr)}`,
        attributes: { file: `${PLANS_PREFIX}/${curr.filename}` },
      });
    }
  }

  for (const [key, prev] of prevByKey) {
    if (!currByKey.has(key)) {
      changes.push({
        type: 'plan-removed',
        summary: `Plan "${prev.name}" removed`,
        attributes: { file: `${PLANS_PREFIX}/${prev.filename}` },
      });
    }
  }

  return changes;
}

/** Stable env-domain id for the plans adapter. */
export const PLANS_DOMAIN_ID = 'plans';

export function createPlansDomainAdapter(
  deps: PlansDomainAdapterDeps,
): DomainAdapter<PlansSnapshot> {
  return {
    domainId: PLANS_DOMAIN_ID,
    renderOrder: deps.renderOrder ?? 6,
    schemaVersion: CORE_ENV_SCHEMA_VERSION,
    promptSection: PlansPromptSection,
    getState(agentInstanceId) {
      return buildPlansState(agentInstanceId, deps.host, deps.store);
    },
    renderState(prev, curr) {
      if (prev === null) return renderFullPlans(curr);
      return renderChangesXml(computePlansChanges(prev, curr));
    },
  };
}
