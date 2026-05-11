import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

/**
 * Shared, sidebar-wide set of agent IDs that are being optimistically
 * removed from the UI (Permanently Delete). Lives at the
 * sidebar root so every component that drives auto-selection (the top
 * section's "pick first active" effect, the active-agents grid, the
 * history combobox) can agree on which ids are transient.
 *
 * Without a shared view, removing the last live agent triggers a loop:
 *   1. Grid removes archived id from history (openAgent becomes null).
 *   2. Top section sees `openAgent === null` + stale `activeAgentIds`
 *      still containing the archived id, and sets openAgent back to it.
 *   3. Grid again clears it. GOTO 1.
 */
export type PendingRemovalsState = {
  pending: ReadonlySet<string>;
  add: (id: string) => void;
  remove: (id: string) => void;
};

const EMPTY_SET: ReadonlySet<string> = new Set();

const PendingRemovalsContext = createContext<PendingRemovalsState>({
  pending: EMPTY_SET,
  add: () => {},
  remove: () => {},
});

export function PendingRemovalsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const add = useCallback((id: string) => {
    setPending((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setPending((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo<PendingRemovalsState>(
    () => ({ pending, add, remove }),
    [pending, add, remove],
  );

  return (
    <PendingRemovalsContext.Provider value={value}>
      {children}
    </PendingRemovalsContext.Provider>
  );
}

export function usePendingRemovals(): PendingRemovalsState {
  return useContext(PendingRemovalsContext);
}
