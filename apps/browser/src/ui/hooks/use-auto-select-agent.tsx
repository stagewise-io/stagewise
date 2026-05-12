import { useEffect, useMemo, useRef, useState } from 'react';
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

/** Grace period after `openAgent` is set to allow a resumed history agent
 *  to appear in `s.agents.instances` before deciding it was removed. */
const RESUME_GRACE_MS = 2500;

export function useAutoSelectFirstAgent(): void {
  const [openAgent, setOpenAgent, removeFromHistory] = useOpenAgent();

  const activeAgentIdsRaw = useKartonState(
    useComparingSelector((s) => Object.keys(s.agents.instances)),
  );
  const { pending: pendingRemovals } = usePendingRemovals();

  // Track when openAgent was last set so we can give resumed agents a
  // grace period to appear in activeAgentIds before auto-removing them.
  const openAgentSetAtRef = useRef(0);
  // Must start null so the first render always sets the timestamp when
  // openAgent is non-null — otherwise a restored agent on mount would
  // bypass the grace period (prevOpenAgentRef === openAgent at init).
  const prevOpenAgentRef = useRef<string | null>(null);
  if (prevOpenAgentRef.current !== openAgent) {
    prevOpenAgentRef.current = openAgent;
    if (openAgent) openAgentSetAtRef.current = Date.now();
  }

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

  // Dummy counter bumped after the grace period to re-trigger the effect
  // when an openAgent wasn't yet active at first check.
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (openAgent && !activeAgentIdSet.has(openAgent)) {
      // If the open agent was set very recently (e.g. by the user clicking
      // a history card), give the backend time to load it before concluding
      // it was removed. Without this, clicking a history agent would
      // immediately get overridden — requiring a second click.
      const elapsed = Date.now() - openAgentSetAtRef.current;
      if (elapsed < RESUME_GRACE_MS) {
        const timer = setTimeout(
          () => setRetryTick((t) => t + 1),
          RESUME_GRACE_MS - elapsed + 50,
        );
        return () => clearTimeout(timer);
      }
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
    retryTick,
  ]);
}
