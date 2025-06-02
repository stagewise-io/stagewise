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
  selectAgent: (agent: string | undefined) => void;

  // App name
  appName: string | undefined;
  displayName?: string; // Optional display name for the current window

  // Available agents - properly typed from the contract
  availableAgents: string[];
  selectedAgent?: string;
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
  displayName: undefined,
  availableAgents: [],
  selectAgent: () => {},
  selectedAgent: undefined,
});

export function VSCodeProvider({ children }: { children: ComponentChildren }) {
  const [windows, setWindows] = useState<SRPCVSCodeContext[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<
    string | undefined
  >(undefined);
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(
    undefined,
  );

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
        setSelectedAgent(undefined);
      }

      // If selected agent is no longer available in the session, clear it
      const currentSession = selectedSessionId
        ? discoveredWindows.find((w) => w.sessionId === selectedSessionId)
        : discoveredWindows[0]; // Use first available if no specific session selected

      if (
        currentSession &&
        selectedAgent &&
        !currentSession.availableAgents?.includes(selectedAgent)
      ) {
        setSelectedAgent(undefined);
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
    // Reset agent selection to auto mode when changing sessions
    setSelectedAgent(undefined);
  };

  const selectAgent = (agent: string | undefined) => {
    setSelectedAgent(agent);
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

  // Get available agents from the selected session, or from any session if none selected
  const availableAgents =
    selectedSession?.availableAgents ||
    (windows.length > 0 ? windows[0]?.availableAgents || [] : []);

  const value: VSCodeContextType = {
    windows,
    isDiscovering,
    discoveryError,
    selectedSession,
    discover,
    selectSession,
    refreshSession,
    appName: selectedSession?.appName,
    displayName: selectedSession?.displayName,
    availableAgents,
    selectAgent,
    selectedAgent,
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

// New convenience hook for agent management
export function useVSCodeAgents() {
  const { availableAgents, selectedAgent, selectAgent } = useVSCode();
  return { availableAgents, selectedAgent, selectAgent };
}
