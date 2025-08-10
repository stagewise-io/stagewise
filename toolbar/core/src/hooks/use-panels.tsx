import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { useAppState } from './use-app-state';
import { useKarton } from './use-karton';

const STORAGE_KEY = 'stagewise_toolbar_open_panels';

interface PersistedState {
  isSettingsOpen: boolean;
  isChatOpen: boolean;
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
   * Whether the settings panel is open
   */
  isSettingsOpen: boolean;

  /**
   * Open the settings panel
   *
   * *Under certain circumstances, the settings panel may not be shown*
   */
  openSettings: () => void;

  /**
   * Close the settings panel
   */
  closeSettings: () => void;

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

  /**
   * Whether the agent connectivity panel is open
   */
  isAgentConnectivityOpen: boolean;
}

const PanelsContext = createContext<PanelsContext>({
  isSettingsOpen: false,
  openSettings: () => null,
  closeSettings: () => null,

  isChatOpen: false,
  openChat: () => null,
  closeChat: () => null,

  openPluginName: null,
  openPlugin: () => null,
  closePlugin: () => null,

  isAgentConnectivityOpen: false,
});

export const PanelsProvider = ({
  children,
}: {
  children?: React.ReactNode;
}) => {
  const { minimized } = useAppState();

  // Load persisted state on initialization
  const persistedState = useMemo(() => loadPersistedState(), []);

  const [isSettingsOpenInternal, setIsSettingsOpen] = useState(
    persistedState.isSettingsOpen ?? false,
  );
  const [isChatOpenInternal, setIsChatOpen] = useState(
    persistedState.isChatOpen ?? false,
  );
  const [openPluginInternal, setOpenPlugin] = useState<string | null>(
    persistedState.openPlugin ?? null,
  );

  const isConnected = useKarton((s) => s.isConnected);

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoad(false);
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // Persist state changes to sessionStorage
  useEffect(() => {
    const currentState: PersistedState = {
      isSettingsOpen: isSettingsOpenInternal,
      isChatOpen: isChatOpenInternal,
      openPlugin: openPluginInternal,
    };
    savePersistedState(currentState);
  }, [isSettingsOpenInternal, isChatOpenInternal, openPluginInternal]);

  const isAgentConnectivityOpen = useMemo(
    () => !isConnected && !isInitialLoad,
    [isConnected, isInitialLoad],
  );

  const isSettingsOpen = useMemo(() => {
    return (
      !isAgentConnectivityOpen &&
      isSettingsOpenInternal &&
      !minimized &&
      !isInitialLoad
    );
  }, [
    isAgentConnectivityOpen,
    isSettingsOpenInternal,
    minimized,
    isInitialLoad,
  ]);

  const isChatOpen = useMemo(() => {
    return (
      !isAgentConnectivityOpen &&
      isChatOpenInternal &&
      !minimized &&
      !isInitialLoad
    );
  }, [isAgentConnectivityOpen, isChatOpenInternal, minimized, isInitialLoad]);

  const openPluginName = useMemo(() => {
    return !isAgentConnectivityOpen && !isInitialLoad && !minimized
      ? openPluginInternal
      : null;
  }, [isAgentConnectivityOpen, openPluginInternal, minimized, isInitialLoad]);

  return (
    <PanelsContext.Provider
      value={{
        isSettingsOpen,
        openSettings: () => setIsSettingsOpen(true),
        closeSettings: () => setIsSettingsOpen(false),

        isChatOpen,
        openChat: () => setIsChatOpen(true),
        closeChat: () => setIsChatOpen(false),

        openPluginName,
        openPlugin: (pluginName: string) => setOpenPlugin(pluginName),
        closePlugin: () => setOpenPlugin(null),

        isAgentConnectivityOpen,
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
