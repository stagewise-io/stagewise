import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useKartonProcedure } from './use-karton';

type OpenAgentState = [
  /** Currently open agent ID (top of the history stack). */
  string | null,
  /** Push an agent to the top of the history stack (deduplicates). */
  (id: string | null) => void,
  /** Remove an agent from the history stack (falls back to previous, or
   *  to `fallback` when the stack is empty). */
  (id: string, fallback?: string | null) => void,
];

export const OpenAgentContext = createContext<OpenAgentState>([
  null,
  () => {},
  () => {},
]);

export const useOpenAgent = () => {
  const context = useContext(OpenAgentContext);
  if (!context) {
    throw new Error('useOpenAgent must be used within a OpenAgentProvider');
  }
  return context;
};

export const OpenAgentProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  // Internal stack of recently-opened agent IDs (last = current).
  // Stored as a ref so mutations don't trigger extra renders — the
  // derived `openAgent` state is the single source of truth for React.
  const stackRef = useRef<string[]>([]);
  const [openAgent, setOpenAgentRaw] = useState<string | null>(null);
  const setActiveBrowserAgent = useKartonProcedure(
    (p) => p.browser.setActiveAgent,
  );

  useEffect(() => {
    void setActiveBrowserAgent(openAgent);
  }, [openAgent, setActiveBrowserAgent]);

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
    },
    [],
  );

  const value = useMemo<OpenAgentState>(
    () => [openAgent, setOpenAgent, removeFromHistory],
    [openAgent, setOpenAgent, removeFromHistory],
  );

  return (
    <OpenAgentContext.Provider value={value}>
      {children}
    </OpenAgentContext.Provider>
  );
};
