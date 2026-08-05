import type { AppState } from '@shared/karton-contracts/ui';
import { AgentTypes } from '@shared/karton-contracts/ui/agent';
import {
  getActiveAgentStateIndicators,
  getAgentStateSeverity,
  type AgentStateSeverity,
} from './agent-list-model';

export type AgentAttentionEntry = {
  id: string;
  title: string;
  status: Exclude<AgentStateSeverity, 'info'> | null;
};

type AgentInstance = AppState['agents']['instances'][string];

export function getAgentAttentionStatus(
  instance: AgentInstance,
  toolboxEntry: AppState['toolbox'][string] | undefined,
): AgentAttentionEntry['status'] {
  const status = getAgentStateSeverity(
    getActiveAgentStateIndicators(instance, toolboxEntry),
  );
  return status === 'info' ? null : status;
}

export function buildAgentAttentionEntries(
  instances: AppState['agents']['instances'],
  toolbox: AppState['toolbox'],
  historyEntries: readonly AgentAttentionEntry[] = [],
): AgentAttentionEntry[] {
  const liveEntries = Object.entries(instances)
    .filter(
      ([, instance]) =>
        instance.type === AgentTypes.CHAT && !instance.sideChatParentId,
    )
    .map(([id, instance]) => ({
      id,
      title: instance.state.title || 'Untitled Agent',
      status: getAgentAttentionStatus(instance, toolbox[id]),
    }));

  const liveIds = new Set(liveEntries.map((entry) => entry.id));
  return [
    ...liveEntries,
    ...historyEntries.filter((entry) => !liveIds.has(entry.id)),
  ];
}

export function findNextAgentAttentionTarget(
  entries: readonly AgentAttentionEntry[],
  currentAgentId: string | null,
): AgentAttentionEntry | null {
  const currentIndex = entries.findIndex(
    (entry) => entry.id === currentAgentId,
  );
  const startIndex = currentIndex >= 0 ? currentIndex : -1;

  for (let offset = 1; offset <= entries.length; offset++) {
    const index = (startIndex + offset) % entries.length;
    const candidate = entries[index];
    if (candidate?.status && candidate.id !== currentAgentId) {
      return candidate;
    }
  }
  return null;
}
