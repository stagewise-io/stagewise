import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from 'react';

export type State = {
  focusedPanel?: 'tab-content' | 'stagewise-ui';
  terminalFocusRequestId?: number;
};

export type TabStateUI = {
  tabUiState: Record<string, State>;
  setTabUiState: (tabId: string, state: State) => void;
  requestTerminalFocus: (tabId: string) => void;
  clearTerminalFocusRequest: (tabId: string) => void;
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
    setTabUiStateInternal((prev) => {
      const prevState = prev[tabId];
      if (prevState?.focusedPanel === newState.focusedPanel) return prev;

      return {
        ...prev,
        [tabId]: { ...prevState, ...newState },
      };
    });
  }, []);

  const requestTerminalFocus = useCallback((tabId: string) => {
    setTabUiStateInternal((prev) => ({
      ...prev,
      [tabId]: {
        ...prev[tabId],
        terminalFocusRequestId: (prev[tabId]?.terminalFocusRequestId ?? 0) + 1,
      },
    }));
  }, []);

  const clearTerminalFocusRequest = useCallback((tabId: string) => {
    setTabUiStateInternal((prev) => ({
      ...prev,
      [tabId]: {
        ...prev[tabId],
        terminalFocusRequestId: undefined,
      },
    }));
  }, []);

  const removeTabUiState = useCallback((tabId: string) => {
    setTabUiStateInternal((prev) => {
      if (!(tabId in prev)) return prev;

      const { [tabId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const value = useMemo<TabStateUI>(
    () => ({
      tabUiState,
      setTabUiState,
      requestTerminalFocus,
      clearTerminalFocusRequest,
      removeTabUiState,
    }),
    [
      tabUiState,
      setTabUiState,
      requestTerminalFocus,
      clearTerminalFocusRequest,
      removeTabUiState,
    ],
  );

  return (
    <TabStateUIContext.Provider value={value}>
      {children}
    </TabStateUIContext.Provider>
  );
};
