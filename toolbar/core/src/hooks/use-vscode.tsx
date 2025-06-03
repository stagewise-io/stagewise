import { createContext } from 'preact';
import { useContext, useState, useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  discoverVSCodeWindows,
  type VSCodeContext as SRPCVSCodeContext,
} from '../srpc';

interface VSCodeContextType {
  // Window discovery
  windows: SRPCVSCodeContext[];
  isDiscovering: boolean;
  discoveryError: string | null;

  // Session management
  selectedSession: SRPCVSCodeContext | undefined;

  // Actions
  discover: () => Promise<void>;
  selectSession: (sessionId: string | undefined) => void;
  refreshSession: () => Promise<void>;

  // App name
  appName: string | undefined;
}

const VSCodeContext = createContext<VSCodeContextType>({
  windows: [],
  isDiscovering: false,
  discoveryError: null,
  selectedSession: undefined,
  discover: async () => {},
  selectSession: () => {},
  refreshSession: async () => {},
  appName: undefined,
});

export function VSCodeProvider({ children }: { children: ComponentChildren }) {
  const [windows, setWindows] = useState<SRPCVSCodeContext[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<
    string | undefined
  >(undefined);

  const discover = async () => {
    setIsDiscovering(true);
    setDiscoveryError(null);

    try {
      const discoveredWindows = await discoverVSCodeWindows();
      setWindows(discoveredWindows);

      // If selected session is no longer available, clear it
      if (
        selectedSessionId &&
        !discoveredWindows.some((w) => w.sessionId === selectedSessionId)
      ) {
        setSelectedSessionId(undefined);
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
    discover,
    selectSession,
    refreshSession,
    appName: selectedSession?.appName,
  };

  return (
    <VSCodeContext.Provider value={value}>{children}</VSCodeContext.Provider>
  );
}

export function useVSCode() {
  return useContext(VSCodeContext);
}

// Convenience hooks for specific functionality
export function useVSCodeWindows() {
  const { windows, isDiscovering, discoveryError, discover } = useVSCode();
  return { windows, isDiscovering, discoveryError, discover };
}

export function useVSCodeSession() {
  const { selectedSession, selectSession, refreshSession } = useVSCode();
  return { selectedSession, selectSession, refreshSession };
}
