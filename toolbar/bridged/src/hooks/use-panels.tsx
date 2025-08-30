import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { useAppState } from './use-app-state.js';
import { useAgents } from './agent/use-agent-provider.js';

const STORAGE_KEY = 'stagewise_toolbar_open_panels';

interface PersistedState {
  isChatOpen: boolean;
  isInfoOpen: boolean;
  openPlugin: string | null;
}

const loadPersistedState = (): Partial<PersistedState> => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn('[PanelsProvider] Failed to load persisted state:', error);
    return {};
  }
};

const savePersistedState = (state: PersistedState) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[PanelsProvider] Failed to save persisted state:', error);
  }
};

interface PanelsContext {
  /**
   * Whether the chat panel is open
   */
  isChatOpen: boolean;

  /**
   * Open the chat panel
   *
   * *Under certain circumstances, the chat panel may not be shown*
   */
  openChat: () => void;

  /**
   * Close the chat panel
   */
  closeChat: () => void;

  /**
   * Whether the info panel is open
   */
  isInfoOpen: boolean;

  /**
   * Open the info panel
   *
   * *Under certain circumstances, the info panel may not be shown*
   */
  openInfo: () => void;

  /**
   * Close the info panel
   */
  closeInfo: () => void;

  /**
   * The name of the plugin that is open
   */
  openPluginName: string | null;

  /**
   * Open a plugin
   *
   * *Under certain circumstances, the plugin may not be shown*
   */
  openPlugin: (pluginName: string) => void;

  /**
   * Close the plugin
   */
  closePlugin: () => void;
}

const PanelsContext = createContext<PanelsContext>({
  isChatOpen: false,
  openChat: () => null,
  closeChat: () => null,

  isInfoOpen: false,
  openInfo: () => null,
  closeInfo: () => null,

  openPluginName: null,
  openPlugin: () => null,
  closePlugin: () => null,
});

export const PanelsProvider = ({
  children,
}: {
  children?: React.ReactNode;
}) => {
  const { minimized } = useAppState();
  const { isInitialLoad } = useAgents();

  // Load persisted state on initialization
  const persistedState = useMemo(() => loadPersistedState(), []);

  const [isChatOpenInternal, setIsChatOpen] = useState(
    persistedState.isChatOpen ?? false,
  );
  const [isInfoOpenInternal, setIsInfoOpen] = useState(
    persistedState.isInfoOpen ?? false,
  );
  const [openPluginInternal, setOpenPlugin] = useState<string | null>(
    persistedState.openPlugin ?? null,
  );

  // Persist state changes to sessionStorage
  useEffect(() => {
    const currentState: PersistedState = {
      isChatOpen: isChatOpenInternal,
      isInfoOpen: isInfoOpenInternal,
      openPlugin: openPluginInternal,
    };
    savePersistedState(currentState);
  }, [isChatOpenInternal, isInfoOpenInternal, openPluginInternal]);

  const isChatOpen = useMemo(() => {
    return isChatOpenInternal && !minimized && !isInitialLoad;
  }, [isChatOpenInternal, minimized, isInitialLoad]);

  const isInfoOpen = useMemo(() => {
    return isInfoOpenInternal && !minimized && !isInitialLoad;
  }, [isInfoOpenInternal, minimized, isInitialLoad]);

  const openPluginName = useMemo(() => {
    return !isInitialLoad && !minimized ? openPluginInternal : null;
  }, [openPluginInternal, minimized, isInitialLoad]);

  return (
    <PanelsContext.Provider
      value={{
        isChatOpen,
        openChat: () => setIsChatOpen(true),
        closeChat: () => setIsChatOpen(false),

        isInfoOpen,
        openInfo: () => setIsInfoOpen(true),
        closeInfo: () => setIsInfoOpen(false),

        openPluginName,
        openPlugin: (pluginName: string) => setOpenPlugin(pluginName),
        closePlugin: () => setOpenPlugin(null),
      }}
    >
      {children}
    </PanelsContext.Provider>
  );
};

/**
 * This hook allows to open and close panels. Some panels that are rendered are controlled by the PanelsProvider itself.
 */
export const usePanels = () => useContext(PanelsContext);
