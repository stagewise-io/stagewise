import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from 'react';

export type State =
  | {
      focusedPanel: 'tab-content';
    }
  | {
      focusedPanel: 'stagewise-ui';
    };

export type TabStateUI = {
  tabUiState: Record<string, State>;
  setTabUiState: (tabId: string, state: State) => void;
  removeTabUiState: (tabId: string) => void;
};

const TabStateUIContext = createContext<TabStateUI | null>(null);

export const useTabUIState = () => {
  const context = useContext(TabStateUIContext);
  if (!context)
    throw new Error('useTabStateUI must be used within a TabStateUIProvider');

  return context;
};

export const TabStateUIProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [tabUiState, setTabUiStateInternal] = useState<Record<string, State>>(
    {},
  );

  const setTabUiState = useCallback((tabId: string, newState: State) => {
    setTabUiStateInternal((prev) => ({
      ...prev,
      [tabId]: { ...prev[tabId], ...newState },
    }));
  }, []);

  const removeTabUiState = useCallback((tabId: string) => {
    setTabUiStateInternal((prev) => {
      const { [tabId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const value = useMemo<TabStateUI>(
    () => ({
      tabUiState,
      setTabUiState,
      removeTabUiState,
    }),
    [tabUiState, setTabUiState, removeTabUiState],
  );

  return (
    <TabStateUIContext.Provider value={value}>
      {children}
    </TabStateUIContext.Provider>
  );
};
