import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

type OpenAgentState = [
  /** Currently open agent ID (top of the history stack). */
  string | null,
  /** Push an agent to the top of the history stack (deduplicates). */
  (id: string | null) => void,
  /** Remove an agent from the history stack (falls back to previous, or
   *  to `fallback` when the stack is empty). */
  (id: string, fallback?: string | null) => void,
];

export type AgentCycleStepDirection = 'next' | 'previous';

export type AgentCycleResult = {
  id: string | null;
  committed: boolean;
};

export type AgentCycleState = {
  previewAgentId: string | null;
  isCyclingAgents: boolean;
  beginAgentCycle: (
    orderedAgentIds: string[],
    direction: AgentCycleStepDirection,
  ) => string | null;
  stepAgentCycle: (
    orderedAgentIds: string[],
    direction: AgentCycleStepDirection,
  ) => string | null;
  commitAgentCycle: () => AgentCycleResult;
  cancelAgentCycle: () => void;
  focusAgentFromHotkey: (id: string | null) => void;
};

type OpenAgentContextValue = {
  tuple: OpenAgentState;
  switcher: AgentCycleState;
};

const noopOpenAgentTuple: OpenAgentState = [null, () => {}, () => {}];

export const noopAgentSwitcher: AgentCycleState = {
  previewAgentId: null,
  isCyclingAgents: false,
  beginAgentCycle: () => null,
  stepAgentCycle: () => null,
  commitAgentCycle: () => ({ id: null, committed: false }),
  cancelAgentCycle: () => {},
  focusAgentFromHotkey: () => {},
};

export const OpenAgentContext = createContext<OpenAgentContextValue>({
  tuple: noopOpenAgentTuple,
  switcher: noopAgentSwitcher,
});

export const useOpenAgent = () => {
  const context = useContext(OpenAgentContext);
  if (!context) {
    throw new Error('useOpenAgent must be used within a OpenAgentProvider');
  }
  return context.tuple;
};

export const useAgentSwitcher = () => {
  const context = useContext(OpenAgentContext);
  if (!context) {
    throw new Error('useAgentSwitcher must be used within a OpenAgentProvider');
  }
  return context.switcher;
};

function dedupeIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function getSteppedIndex({
  currentIndex,
  count,
  direction,
}: {
  currentIndex: number;
  count: number;
  direction: AgentCycleStepDirection;
}): number {
  if (direction === 'next') return (currentIndex + 1) % count;
  return (currentIndex - 1 + count) % count;
}

export const OpenAgentProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  // Internal stack of recently-opened agent IDs (last = current).
  // Stored as a ref so mutations don't trigger extra renders — the
  // derived `openAgent` state is the single source of truth for React.
  const stackRef = useRef<string[]>([]);
  const cycleSnapshotRef = useRef<string[] | null>(null);
  const cycleStartAgentRef = useRef<string | null>(null);
  const cycleCursorRef = useRef<number>(-1);
  const cyclePreviewRef = useRef<string | null>(null);

  const [openAgent, setOpenAgentRaw] = useState<string | null>(null);
  const [previewAgentId, setPreviewAgentId] = useState<string | null>(null);
  const [isCyclingAgents, setIsCyclingAgents] = useState(false);

  const setPreview = useCallback((id: string | null) => {
    cyclePreviewRef.current = id;
    setPreviewAgentId(id);
  }, []);

  const setOpenAgent = useCallback((id: string | null) => {
    const stack = stackRef.current;
    if (!id) {
      stack.length = 0;
      setOpenAgentRaw(null);
      return;
    }
    const idx = stack.indexOf(id);
    if (idx !== -1) stack.splice(idx, 1);
    stack.push(id);
    setOpenAgentRaw(id);
  }, []);

  const focusAgentFromHotkey = useCallback(
    (id: string | null) => {
      if (!id) return;
      cycleSnapshotRef.current = null;
      cycleStartAgentRef.current = null;
      cycleCursorRef.current = -1;
      setIsCyclingAgents(false);
      setPreview(null);
      setOpenAgent(id);
    },
    [setOpenAgent, setPreview],
  );

  const removeFromHistory = useCallback(
    (id: string, fallback?: string | null) => {
      const stack = stackRef.current;
      const idx = stack.indexOf(id);
      if (idx !== -1) stack.splice(idx, 1);
      const next = stack[stack.length - 1] ?? fallback ?? null;
      // If the fallback was used, push it onto the stack so subsequent
      // removeFromHistory calls have an entry to fall back to.
      if (next && next === fallback && !stack.includes(next)) {
        stack.push(next);
      }
      setOpenAgentRaw((prev) => (prev === id ? next : prev));

      if (cyclePreviewRef.current === id) setPreview(null);
    },
    [setPreview],
  );

  const buildCycleSnapshot = useCallback(
    (orderedAgentIds: string[]): string[] => {
      const orderedIds = dedupeIds(orderedAgentIds);
      const available = new Set(orderedIds);
      const mruIds = stackRef.current.filter((id) => available.has(id));
      const snapshot = [
        ...mruIds.slice().reverse(),
        ...orderedIds.filter((id) => !mruIds.includes(id)),
      ];

      return snapshot;
    },
    [],
  );

  const beginAgentCycle = useCallback(
    (orderedAgentIds: string[], direction: AgentCycleStepDirection) => {
      const snapshot = buildCycleSnapshot(orderedAgentIds);
      if (snapshot.length === 0) return null;

      cycleSnapshotRef.current = snapshot;
      cycleStartAgentRef.current = openAgent;
      setIsCyclingAgents(true);

      const startIndex = openAgent ? snapshot.indexOf(openAgent) : -1;
      const currentIndex =
        startIndex !== -1 ? startIndex : direction === 'next' ? -1 : 0;
      const nextIndex = getSteppedIndex({
        currentIndex,
        count: snapshot.length,
        direction,
      });
      const nextId = snapshot[nextIndex] ?? null;

      cycleCursorRef.current = nextIndex;
      setPreview(nextId);
      return nextId;
    },
    [buildCycleSnapshot, openAgent, setPreview],
  );

  const stepAgentCycle = useCallback(
    (orderedAgentIds: string[], direction: AgentCycleStepDirection) => {
      const snapshot = cycleSnapshotRef.current;
      if (!snapshot) return beginAgentCycle(orderedAgentIds, direction);
      if (snapshot.length === 0) return null;

      const nextIndex = getSteppedIndex({
        currentIndex: cycleCursorRef.current,
        count: snapshot.length,
        direction,
      });
      const nextId = snapshot[nextIndex] ?? null;

      cycleCursorRef.current = nextIndex;
      setPreview(nextId);
      return nextId;
    },
    [beginAgentCycle, setPreview],
  );

  const commitAgentCycle = useCallback((): AgentCycleResult => {
    const id = cyclePreviewRef.current;
    const wasCycling = cycleSnapshotRef.current !== null || isCyclingAgents;

    cycleSnapshotRef.current = null;
    cycleStartAgentRef.current = null;
    cycleCursorRef.current = -1;
    setIsCyclingAgents(false);
    setPreview(null);

    if (!id) return { id: null, committed: false };

    const alreadyOpen = id === openAgent;
    setOpenAgent(id);

    return { id, committed: wasCycling && !alreadyOpen };
  }, [isCyclingAgents, openAgent, setOpenAgent, setPreview]);

  const cancelAgentCycle = useCallback(() => {
    cycleSnapshotRef.current = null;
    cycleStartAgentRef.current = null;
    cycleCursorRef.current = -1;
    setIsCyclingAgents(false);
    setPreview(null);
  }, [setPreview]);

  const tuple = useMemo<OpenAgentState>(
    () => [openAgent, setOpenAgent, removeFromHistory],
    [openAgent, setOpenAgent, removeFromHistory],
  );

  const switcher = useMemo<AgentCycleState>(
    () => ({
      previewAgentId,
      isCyclingAgents,
      beginAgentCycle,
      stepAgentCycle,
      commitAgentCycle,
      cancelAgentCycle,
      focusAgentFromHotkey,
    }),
    [
      previewAgentId,
      isCyclingAgents,
      beginAgentCycle,
      stepAgentCycle,
      commitAgentCycle,
      cancelAgentCycle,
      focusAgentFromHotkey,
    ],
  );

  const value = useMemo<OpenAgentContextValue>(
    () => ({ tuple, switcher }),
    [tuple, switcher],
  );

  return (
    <OpenAgentContext.Provider value={value}>
      {children}
    </OpenAgentContext.Provider>
  );
};
