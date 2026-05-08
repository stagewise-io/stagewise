import { useEffect, useMemo } from 'react';
import { useComparingSelector, useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { usePendingRemovals } from '@ui/hooks/use-pending-agent-removals';

/**
 * Central, headless auto-selector: whenever `openAgent` is null (or points
 * at an id that is no longer active), pick the first active agent.
 *
 * Lives at the root of the main layout so it runs regardless of whether
 * the sidebar — which historically hosted this effect inside
 * `AgentsSelector` — is mounted. Without this, restarting the app with a
 * collapsed sidebar left `ChatPanel` stuck on the "No agent selected"
 * empty state because the effect-bearing component never rendered.
 */
export function useAutoSelectFirstAgent(): void {
  const [openAgent, setOpenAgent, removeFromHistory] = useOpenAgent();

  const activeAgentIdsRaw = useKartonState(
    useComparingSelector((s) => Object.keys(s.agents.instances)),
  );
  const { pending: pendingRemovals } = usePendingRemovals();

  // Filter out ids that are being optimistically removed (Archive/Delete).
  // Including them in auto-select would ping-pong openAgent back onto an
  // id the grid is trying to evict, looping infinitely until the backend
  // catches up.
  const activeAgentIds = useMemo(
    () =>
      pendingRemovals.size === 0
        ? activeAgentIdsRaw
        : activeAgentIdsRaw.filter((id) => !pendingRemovals.has(id)),
    [activeAgentIdsRaw, pendingRemovals],
  );
  const activeAgentIdSet = useMemo(
    () => new Set(activeAgentIds),
    [activeAgentIds],
  );

  useEffect(() => {
    if (openAgent && !activeAgentIdSet.has(openAgent)) {
      // The open agent was removed — pop it from the history stack. The
      // fallback ensures that when the stack is empty we jump straight to
      // the first active agent in one render instead of going through
      // null → pick.
      removeFromHistory(openAgent, activeAgentIds[0] ?? null);
    } else if (!openAgent && activeAgentIds.length > 0) {
      setOpenAgent(activeAgentIds[0]!);
    }
  }, [
    openAgent,
    activeAgentIdSet,
    activeAgentIds,
    removeFromHistory,
    setOpenAgent,
  ]);
}
