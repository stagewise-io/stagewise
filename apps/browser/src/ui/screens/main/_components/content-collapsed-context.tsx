import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'stagewise-content-collapsed';

interface ContentCollapsedCtx {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggle: () => void;
}

const ContentCollapsedContext = createContext<ContentCollapsedCtx | null>(null);

function readInitialContentCollapsed(): boolean {
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
    // ignore
  }
}

export function ContentCollapsedProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [collapsed, setCollapsedState] = useState<boolean>(
    readInitialContentCollapsed,
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

  const value = useMemo<ContentCollapsedCtx>(
    () => ({ collapsed, setCollapsed, toggle }),
    [collapsed, setCollapsed, toggle],
  );

  return (
    <ContentCollapsedContext.Provider value={value}>
      {children}
    </ContentCollapsedContext.Provider>
  );
}

export function useContentCollapsed(): ContentCollapsedCtx {
  const ctx = useContext(ContentCollapsedContext);
  if (!ctx) {
    throw new Error(
      'useContentCollapsed must be used inside ContentCollapsedProvider',
    );
  }
  return ctx;
}
