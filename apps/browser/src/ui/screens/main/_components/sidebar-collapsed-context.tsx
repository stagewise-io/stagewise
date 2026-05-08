import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'stagewise-sidebar-collapsed';

interface SidebarCollapsedCtx {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggle: () => void;
}

const SidebarCollapsedContext = createContext<SidebarCollapsedCtx | null>(null);

/**
 * Read the persisted collapsed state synchronously. Exported so callers
 * (e.g. the sidebar panel) can seed `defaultSize` on the very first render
 * and avoid a one-frame expand-then-collapse flash when the user's saved
 * state is "collapsed".
 */
export function readInitialSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persist(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // ignore (e.g. private mode, disabled storage)
  }
}

export function SidebarCollapsedProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [collapsed, setCollapsedState] = useState<boolean>(
    readInitialSidebarCollapsed,
  );

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState((prev) => {
      if (prev === value) return prev;
      persist(value);
      return value;
    });
  }, []);

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      persist(next);
      return next;
    });
  }, []);

  const value = useMemo<SidebarCollapsedCtx>(
    () => ({ collapsed, setCollapsed, toggle }),
    [collapsed, setCollapsed, toggle],
  );

  return (
    <SidebarCollapsedContext.Provider value={value}>
      {children}
    </SidebarCollapsedContext.Provider>
  );
}

export function useSidebarCollapsed(): SidebarCollapsedCtx {
  const ctx = useContext(SidebarCollapsedContext);
  if (!ctx) {
    throw new Error(
      'useSidebarCollapsed must be used inside SidebarCollapsedProvider',
    );
  }
  return ctx;
}
