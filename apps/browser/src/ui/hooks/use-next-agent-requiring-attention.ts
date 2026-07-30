import { useComparingSelector, useKartonState } from './use-karton';
import {
  buildAgentAttentionEntries,
  findNextAgentAttentionTarget,
} from '@ui/screens/main/_lib/agent-attention';

export function useNextAgentRequiringAttention(currentAgentId: string | null) {
  return useKartonState(
    useComparingSelector((state) =>
      findNextAgentAttentionTarget(
        buildAgentAttentionEntries(state.agents.instances, state.toolbox),
        currentAgentId,
      ),
    ),
  );
}
