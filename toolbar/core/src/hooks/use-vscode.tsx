import { createContext } from 'preact';
import { useContext, useState, useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  discoverVSCodeWindows,
  type VSCodeContext as SRPCVSCodeContext,
} from '../srpc';

// Utility function to get current port from browser location
const getCurrentPort = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.port || '80'; // Default to 80 if no port specified
  }
  return '80'; // Fallback for SSR or testing
};

// Generate port-specific storage key
const getStorageKey = (): string => {
  const port = getCurrentPort();
  return `vscode-selected-session-id-on-browser-port-${port}`;
};

// Utility functions for localStorage
const getStoredSessionId = (): string | undefined => {
  try {
    return localStorage.getItem(getStorageKey()) || undefined;
  } catch {
    return undefined;
  }
};

const setStoredSessionId = (sessionId: string | undefined): void => {
  try {
    if (sessionId) {
      localStorage.setItem(getStorageKey(), sessionId);
    } else {
      localStorage.removeItem(getStorageKey());
    }
  } catch {
    // Ignore localStorage errors (e.g., in incognito mode)
  }
};

/**
 * Context type for IDE integration functionality.
 * Provides access to window discovery, session management, and selection prompts.
 */
interface VSCodeContextType {
  // Window discovery
  /** Array of discovered IDE windows/instances */
  windows: SRPCVSCodeContext[];
  /** Whether window discovery is currently in progress */
  isDiscovering: boolean;
  /** Error message if discovery failed, null if no error */
  discoveryError: string | null;

  // Session management
  /** Currently selected IDE session, undefined if none selected */
  selectedSession: SRPCVSCodeContext | undefined;

  // Window selection prompt
  /**
   * True when user should be prompted to select a window.
   * Becomes true when multiple windows are available and either:
   * - No sessionId is saved for the current browser port, OR
   * - The saved sessionId for the current port is no longer available in discovered windows
   */
  shouldPromptWindowSelection: boolean;
  /** Set whether the window selection prompt should be shown */
  setShouldPromptWindowSelection: (show: boolean) => void;

  // Actions
  /** Discover available IDE windows */
  discover: () => Promise<void>;
  /** Select a specific session by ID, or undefined to clear selection */
  selectSession: (sessionId: string | undefined) => void;
  /** Refresh the currently selected session by re-discovering */
  refreshSession: () => Promise<void>;

  // App name
  /** Name of the currently selected IDE application */
  appName: string | undefined;
}

const VSCodeContext = createContext<VSCodeContextType>({
  windows: [],
  isDiscovering: false,
  discoveryError: null,
  selectedSession: undefined,
  shouldPromptWindowSelection: false,
  setShouldPromptWindowSelection: () => {},
  discover: async () => {},
  selectSession: () => {},
  refreshSession: async () => {},
  appName: undefined,
});

/**
 * Provider component for IDE integration functionality.
 * Manages window discovery, session selection, and persistent storage.
 *
 * Features:
 * - Automatically discovers IDE windows on mount
 * - Persists selected session per browser port across refreshes
 * - Intelligently prompts for window selection when needed
 * - Uses port-specific storage keys for different development environments
 *
 * @param children - Child components that will have access to IDE context
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <VSCodeProvider>
 *       <MyComponent />
 *     </VSCodeProvider>
 *   );
 * }
 * ```
 */
export function VSCodeProvider({ children }: { children: ComponentChildren }) {
  const [windows, setWindows] = useState<SRPCVSCodeContext[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<
    string | undefined
  >(getStoredSessionId());
  const [shouldPromptWindowSelection, setShouldPromptWindowSelection] =
    useState(false);

  const discover = async () => {
    setIsDiscovering(true);
    setDiscoveryError(null);

    try {
      const discoveredWindows = await discoverVSCodeWindows();
      setWindows(discoveredWindows);

      // Get stored session ID for current port
      const storedSessionId = getStoredSessionId();

      // Determine if we should prompt for selection
      const shouldPrompt =
        (discoveredWindows.length > 1 && !storedSessionId) || // No saved sessionId for current port
        (storedSessionId &&
          !discoveredWindows.some((w) => w.sessionId === storedSessionId)); // Saved sessionId not in discovered windows

      setShouldPromptWindowSelection(shouldPrompt);

      // If selected session is no longer available, clear it
      if (
        selectedSessionId &&
        !discoveredWindows.some((w) => w.sessionId === selectedSessionId)
      ) {
        setSelectedSessionId(undefined);
        setStoredSessionId(undefined);
      }
    } catch (err) {
      setDiscoveryError(
        err instanceof Error ? err.message : 'Failed to discover windows',
      );
    } finally {
      setIsDiscovering(false);
    }
  };

  const selectSession = (sessionId: string | undefined) => {
    if (!sessionId || sessionId === '') {
      setStoredSessionId(undefined);
      setSelectedSessionId(undefined);
      return;
    }

    setSelectedSessionId(sessionId);
    setStoredSessionId(sessionId);

    // When user selects a session, clear the window selection prompt
    if (sessionId) {
      setShouldPromptWindowSelection(false);
    }
  };

  const refreshSession = async () => {
    if (selectedSessionId) {
      // Re-discover to get fresh session info
      await discover();
    }
  };

  // Auto-discover on mount
  useEffect(() => {
    discover();
  }, []);

  const selectedSession = windows.find(
    (w) => w.sessionId === selectedSessionId,
  );

  const value: VSCodeContextType = {
    windows,
    isDiscovering,
    discoveryError,
    selectedSession,
    shouldPromptWindowSelection,
    setShouldPromptWindowSelection,
    discover,
    selectSession,
    refreshSession,
    appName: selectedSession?.appName,
  };

  return (
    <VSCodeContext.Provider value={value}>{children}</VSCodeContext.Provider>
  );
}

/**
 * Main hook for accessing IDE integration functionality.
 * Provides complete access to all IDE context including window discovery,
 * session management, and selection prompts.
 *
 * @returns VSCodeContextType - Complete IDE context
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {
 *     windows,
 *     selectedSession,
 *     shouldPromptWindowSelection,
 *     selectSession,
 *     discover
 *   } = useVSCode();
 *
 *   if (shouldPromptWindowSelection) {
 *     return <WindowSelectionPrompt />;
 *   }
 *
 *   return <div>Connected to: {selectedSession?.appName}</div>;
 * }
 * ```
 */
export function useVSCode() {
  return useContext(VSCodeContext);
}

/**
 * Convenience hook for IDE window discovery functionality.
 * Use this when you only need access to window discovery features.
 *
 * @returns Object containing windows array, discovery state, and discover function
 *
 * @example
 * ```tsx
 * function WindowList() {
 *   const { windows, isDiscovering, discoveryError, discover } = useVSCodeWindows();
 *
 *   if (isDiscovering) return <div>Discovering IDE windows...</div>;
 *   if (discoveryError) return <div>Error: {discoveryError}</div>;
 *
 *   return (
 *     <div>
 *       <button onClick={discover}>Refresh</button>
 *       <ul>
 *         {windows.map(window => (
 *           <li key={window.sessionId}>{window.appName}</li>
 *         ))}
 *       </ul>
 *     </div>
 *   );
 * }
 * ```
 */
export function useVSCodeWindows() {
  const { windows, isDiscovering, discoveryError, discover } = useVSCode();
  return { windows, isDiscovering, discoveryError, discover };
}

/**
 * Convenience hook for IDE session management.
 * Use this when you only need access to the selected session and session controls.
 *
 * @returns Object containing selected session and session management functions
 *
 * @example
 * ```tsx
 * function SessionInfo() {
 *   const { selectedSession, selectSession, refreshSession } = useVSCodeSession();
 *
 *   if (!selectedSession) {
 *     return <div>No IDE session selected</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <h3>Connected to: {selectedSession.appName}</h3>
 *       <button onClick={refreshSession}>Refresh Session</button>
 *       <button onClick={() => selectSession(undefined)}>Disconnect</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useVSCodeSession() {
  const { selectedSession, selectSession, refreshSession } = useVSCode();
  return { selectedSession, selectSession, refreshSession };
}

/**
 * Convenience hook for IDE window selection prompts.
 * Use this when you need to implement a window selection UI.
 *
 * The shouldPromptWindowSelection flag is true when:
 * - Multiple windows are available AND
 * - Either no sessionId is saved for the current browser port OR the saved sessionId is no longer available
 *
 * @returns Object containing windows, prompt flag, and selection function
 *
 * @example
 * ```tsx
 * function WindowSelectionPrompt() {
 *   const { windows, shouldPromptWindowSelection, setShouldPromptWindowSelection, selectSession } = useVSCodeWindowSelection();
 *
 *   if (!shouldPromptWindowSelection) return null;
 *
 *   return (
 *     <div className="modal">
 *       <h3>Multiple IDE windows detected</h3>
 *       <p>Please select which window to connect to:</p>
 *       {windows.map(window => (
 *         <button
 *           key={window.sessionId}
 *           onClick={() => selectSession(window.sessionId)}
 *         >
 *           {window.appName}
 *         </button>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useVSCodeWindowSelection() {
  const {
    windows,
    shouldPromptWindowSelection,
    setShouldPromptWindowSelection,
    selectSession,
  } = useVSCode();
  return {
    windows,
    shouldPromptWindowSelection,
    setShouldPromptWindowSelection,
    selectSession,
  };
}
