import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { useAgents } from './agent/use-agent-provider';
import { useAppState } from './use-app-state';

const STORAGE_KEY = 'stagewise_toolbar_open_panels';

interface PersistedState {
  isSettingsOpen: boolean;
  isChatOpen: boolean;
  openPlugin: string | null;
  agentConnectivityManuallyDismissed: boolean;
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

  /**
   * Manually open the agent connectivity panel
   *
   * *This will only happen if the toolbar is in a state that requires the user to connect to an agent*
   */
  openAgentConnectivity: () => void;

  /**
   * Manually close the agent connectivity panel
   *
   * *This can be used to hide the connectivity panel, if the user doesn't care about stagewise in this moment.*
   */
  closeAgentConnectivity: () => void;
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
  openAgentConnectivity: () => null,
  closeAgentConnectivity: () => null,
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

  const {
    connected,
    connectedUnavailable,
    requiresUserAttention,
    isInitialLoad,
  } = useAgents();

  const [
    agentConnectivityManuallyDismissed,
    setAgentConnectivityManuallyDismissed,
  ] = useState(persistedState.agentConnectivityManuallyDismissed ?? false);

  // Track if we should show the warning for app-hosted agents (with delay)
  const [showAppHostedWarning, setShowAppHostedWarning] = useState(false);

  // Persist state changes to sessionStorage
  useEffect(() => {
    const currentState: PersistedState = {
      isSettingsOpen: isSettingsOpenInternal,
      isChatOpen: isChatOpenInternal,
      openPlugin: openPluginInternal,
      agentConnectivityManuallyDismissed,
    };
    savePersistedState(currentState);
  }, [
    isSettingsOpenInternal,
    isChatOpenInternal,
    openPluginInternal,
    agentConnectivityManuallyDismissed,
  ]);

  useEffect(() => {
    if (connected && !connectedUnavailable) {
      setAgentConnectivityManuallyDismissed(false);
    }
  }, [connected, connectedUnavailable]);

  // Handle 500ms delay for app-hosted agent warning on initial load
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;

    if (!connected) {
      // If this is an app-hosted agent and not connected, wait 500ms before showing warning
      timeoutId = setTimeout(() => {
        setShowAppHostedWarning(true);
      }, 500);
    } else if (connected) {
      // Clear the warning immediately when connected
      setShowAppHostedWarning(false);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [connected]);

  const isAgentConnectivityOpen = useMemo(() => {
    // Special case: For app-hosted agents, use the delayed warning state
    if (
      !connected &&
      showAppHostedWarning &&
      !agentConnectivityManuallyDismissed &&
      !minimized
    ) {
      console.debug(
        '[PanelsProvider] Showing agent connectivity panel for app-hosted agent (after delay)',
      );
      return true;
    }

    const result =
      requiresUserAttention &&
      !agentConnectivityManuallyDismissed &&
      !minimized &&
      !isInitialLoad;
    console.debug('[PanelsProvider] isAgentConnectivityOpen calculation:', {
      requiresUserAttention,
      agentConnectivityManuallyDismissed,
      minimized,
      isInitialLoad,
      connected,
      showAppHostedWarning,
      result,
    });
    return result;
  }, [
    requiresUserAttention,
    agentConnectivityManuallyDismissed,
    minimized,
    isInitialLoad,
    connected,
    showAppHostedWarning,
  ]);

  const isSettingsOpen = useMemo(() => {
    return (
      !requiresUserAttention &&
      isSettingsOpenInternal &&
      !minimized &&
      !isInitialLoad
    );
  }, [requiresUserAttention, isSettingsOpenInternal, minimized, isInitialLoad]);

  const isChatOpen = useMemo(() => {
    return (
      !requiresUserAttention &&
      isChatOpenInternal &&
      !minimized &&
      !isInitialLoad
    );
  }, [requiresUserAttention, isChatOpenInternal, minimized, isInitialLoad]);

  const openPluginName = useMemo(() => {
    return !requiresUserAttention && !isInitialLoad && !minimized
      ? openPluginInternal
      : null;
  }, [requiresUserAttention, openPluginInternal, minimized, isInitialLoad]);

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
        openAgentConnectivity: () =>
          setAgentConnectivityManuallyDismissed(false),
        closeAgentConnectivity: () =>
          setAgentConnectivityManuallyDismissed(true),
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
