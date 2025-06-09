import { createContext } from 'preact';
import { useContext, useState, useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  discoverVSCodeWindows,
  type VSCodeContext as SRPCVSCodeContext,
} from '../srpc';

// Constants for localStorage keys
const SELECTED_SESSION_STORAGE_KEY = 'vscode-selected-session-id';
const LAST_WINDOWS_HASH_STORAGE_KEY = 'vscode-last-windows-hash';

// Utility functions for localStorage
const getStoredSessionId = (): string | undefined => {
  try {
    return localStorage.getItem(SELECTED_SESSION_STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
};

const setStoredSessionId = (sessionId: string | undefined): void => {
  try {
    if (sessionId) {
      localStorage.setItem(SELECTED_SESSION_STORAGE_KEY, sessionId);
    } else {
      localStorage.removeItem(SELECTED_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage errors (e.g., in incognito mode)
  }
};

const getLastWindowsHash = (): string | undefined => {
  try {
    return localStorage.getItem(LAST_WINDOWS_HASH_STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
};

const setLastWindowsHash = (hash: string): void => {
  try {
    localStorage.setItem(LAST_WINDOWS_HASH_STORAGE_KEY, hash);
  } catch {
    // Ignore localStorage errors
  }
};

/**
 * Creates a hash of windows to detect changes in available VS Code instances.
 * Used to determine when to prompt users for window selection.
 */
const createWindowsHash = (windows: SRPCVSCodeContext[]): string => {
  return windows
    .map((w) => `${w.sessionId}-${w.appName}`)
    .sort()
    .join('|');
};

/**
 * Context type for VS Code integration functionality.
 * Provides access to window discovery, session management, and selection prompts.
 */
interface VSCodeContextType {
  // Window discovery
  /** Array of discovered VS Code windows/instances */
  windows: SRPCVSCodeContext[];
  /** Whether window discovery is currently in progress */
  isDiscovering: boolean;
  /** Error message if discovery failed, null if no error */
  discoveryError: string | null;

  // Session management
  /** Currently selected VS Code session, undefined if none selected */
  selectedSession: SRPCVSCodeContext | undefined;

  // Window selection prompt
  /**
   * True when user should be prompted to select a window.
   * Becomes true when multiple windows are available and either:
   * - User has never selected a window before, OR
   * - Available windows have changed since last selection
   */
  shouldPromptWindowSelection: boolean;

  // Actions
  /** Discover available VS Code windows */
  discover: () => Promise<void>;
  /** Select a specific session by ID, or undefined to clear selection */
  selectSession: (sessionId: string | undefined) => void;
  /** Refresh the currently selected session by re-discovering */
  refreshSession: () => Promise<void>;

  // App name
  /** Name of the currently selected VS Code application */
  appName: string | undefined;
}

const VSCodeContext = createContext<VSCodeContextType>({
  windows: [],
  isDiscovering: false,
  discoveryError: null,
  selectedSession: undefined,
  shouldPromptWindowSelection: false,
  discover: async () => {},
  selectSession: () => {},
  refreshSession: async () => {},
  appName: undefined,
});

/**
 * Provider component for VS Code integration functionality.
 * Manages window discovery, session selection, and persistent storage.
 *
 * Features:
 * - Automatically discovers VS Code windows on mount
 * - Persists selected session across browser refreshes
 * - Intelligently prompts for window selection when needed
 * - Detects when available windows change
 *
 * @param children - Child components that will have access to VS Code context
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

      // Check if we should prompt for window selection
      const currentWindowsHash = createWindowsHash(discoveredWindows);
      const lastWindowsHash = getLastWindowsHash();

      // Determine if we should prompt for selection
      const shouldPrompt =
        discoveredWindows.length > 1 &&
        (!lastWindowsHash || // Never selected before
          lastWindowsHash !== currentWindowsHash); // Windows changed

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
    setSelectedSessionId(sessionId);
    setStoredSessionId(sessionId);

    // When user selects a session, store the current windows hash and clear prompt
    if (sessionId && windows.length > 0) {
      const currentWindowsHash = createWindowsHash(windows);
      setLastWindowsHash(currentWindowsHash);
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

  const selectedSession = selectedSessionId
    ? windows.find((w) => w.sessionId === selectedSessionId)
    : undefined;

  const value: VSCodeContextType = {
    windows,
    isDiscovering,
    discoveryError,
    selectedSession,
    shouldPromptWindowSelection,
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
 * Main hook for accessing VS Code integration functionality.
 * Provides complete access to all VS Code context including window discovery,
 * session management, and selection prompts.
 *
 * @returns VSCodeContextType - Complete VS Code context
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
 * Convenience hook for VS Code window discovery functionality.
 * Use this when you only need access to window discovery features.
 *
 * @returns Object containing windows array, discovery state, and discover function
 *
 * @example
 * ```tsx
 * function WindowList() {
 *   const { windows, isDiscovering, discoveryError, discover } = useVSCodeWindows();
 *
 *   if (isDiscovering) return <div>Discovering VS Code windows...</div>;
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
 * Convenience hook for VS Code session management.
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
 *     return <div>No VS Code session selected</div>;
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
 * Convenience hook for VS Code window selection prompts.
 * Use this when you need to implement a window selection UI.
 *
 * The shouldPromptWindowSelection flag is true when:
 * - Multiple windows are available AND
 * - Either user has never selected a window OR available windows have changed
 *
 * @returns Object containing windows, prompt flag, and selection function
 *
 * @example
 * ```tsx
 * function WindowSelectionPrompt() {
 *   const { windows, shouldPromptWindowSelection, selectSession } = useVSCodeWindowSelection();
 *
 *   if (!shouldPromptWindowSelection) return null;
 *
 *   return (
 *     <div className="modal">
 *       <h3>Multiple VS Code windows detected</h3>
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
  const { windows, shouldPromptWindowSelection, selectSession } = useVSCode();
  return { windows, shouldPromptWindowSelection, selectSession };
}
