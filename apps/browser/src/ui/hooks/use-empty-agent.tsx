import { useRef } from 'react';
import { useKartonState } from '@ui/hooks/use-karton';
import { AgentTypes } from '@shared/karton-contracts/ui/agent';
import { extractTipTapText } from '@ui/utils/text-utils';

/**
 * Returns the ID of an existing empty CHAT agent (no history + no meaningful
 * input text) that can be reused instead of creating a brand-new one.
 *
 * The result is also exposed via a ref so callbacks can read the latest value
 * without re-creating themselves.
 */
export function useEmptyAgentId() {
  const emptyAgentId = useKartonState((s) => {
    for (const [id, agent] of Object.entries(s.agents.instances)) {
      if (agent.type !== AgentTypes.CHAT) continue;
      if (agent.parentAgentInstanceId || agent.sideChatParentId) continue;
      if (agent.state.history.length > 0) continue;
      const inputText = agent.state.inputState
        ? extractTipTapText(agent.state.inputState).trim()
        : '';
      if (!inputText) return id;
    }
    return null;
  });

  const ref = useRef(emptyAgentId);
  ref.current = emptyAgentId;

  return [emptyAgentId, ref] as const;
}
