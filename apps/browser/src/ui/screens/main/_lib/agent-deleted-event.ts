export const AGENT_DELETED_EVENT = 'agent-deleted';

export type AgentDeletedDetail = {
  agentId: string;
};

export function dispatchAgentDeleted(detail: AgentDeletedDetail) {
  window.dispatchEvent(
    new CustomEvent<AgentDeletedDetail>(AGENT_DELETED_EVENT, {
      detail,
    }),
  );
}

export function isAgentDeletedEvent(
  event: Event,
): event is CustomEvent<AgentDeletedDetail> {
  if (event.type !== AGENT_DELETED_EVENT) return false;
  if (!(event instanceof CustomEvent)) return false;
  const detail = event.detail as Partial<AgentDeletedDetail> | undefined;
  return typeof detail?.agentId === 'string';
}
