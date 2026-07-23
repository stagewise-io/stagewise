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
): AgentAttentionEntry[] {
  return Object.entries(instances)
    .filter(([, instance]) => instance.type === AgentTypes.CHAT)
    .map(([id, instance]) => ({
      id,
      title: instance.state.title || 'Untitled Agent',
      status: getAgentAttentionStatus(instance, toolbox[id]),
    }));
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
