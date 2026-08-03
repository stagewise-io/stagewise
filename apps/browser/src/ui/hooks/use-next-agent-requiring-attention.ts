import { useComparingSelector, useKartonState } from './use-karton';
import {
  buildAgentAttentionEntries,
  findNextAgentAttentionTarget,
} from '@ui/screens/main/_lib/agent-attention';
import { useHistoryAttentionEntries } from '@ui/screens/main/_components/agent-attention-context';

export function useNextAgentRequiringAttention(currentAgentId: string | null) {
  const historyEntries = useHistoryAttentionEntries();
  return useKartonState(
    useComparingSelector((state) =>
      findNextAgentAttentionTarget(
        buildAgentAttentionEntries(
          state.agents.instances,
          state.toolbox,
          historyEntries,
        ),
        currentAgentId,
      ),
    ),
  );
}
