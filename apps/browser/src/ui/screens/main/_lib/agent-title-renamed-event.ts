export const AGENT_TITLE_RENAMED_EVENT = 'agent-title-renamed';

export type AgentTitleRenamedDetail = {
  agentId: string;
  title: string;
};

export function dispatchAgentTitleRenamed(detail: AgentTitleRenamedDetail) {
  window.dispatchEvent(
    new CustomEvent<AgentTitleRenamedDetail>(AGENT_TITLE_RENAMED_EVENT, {
      detail,
    }),
  );
}

export function isAgentTitleRenamedEvent(
  event: Event,
): event is CustomEvent<AgentTitleRenamedDetail> {
  if (event.type !== AGENT_TITLE_RENAMED_EVENT) return false;
  if (!(event instanceof CustomEvent)) return false;
  const detail = event.detail as Partial<AgentTitleRenamedDetail> | undefined;
  return (
    typeof detail?.agentId === 'string' && typeof detail?.title === 'string'
  );
}
