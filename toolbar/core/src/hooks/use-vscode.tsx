import { createContext } from 'preact';
import { useContext, useState, useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  discoverVSCodeWindows,
  type VSCodeContext as SRPCVSCodeContext,
} from '../srpc';
import { createSRPCClientBridge } from '@stagewise/srpc/client';
import { contract } from '@stagewise/extension-toolbar-srpc-contract';

interface VSCodeContextType {
  // Window discovery
  windows: SRPCVSCodeContext[];
  isDiscovering: boolean;
  discoveryError: string | null;

  // Session management
  selectedSession: SRPCVSCodeContext | undefined;

  // Actions
  discover: () => Promise<void>;
  discoverAgents: (sessionId?: string) => Promise<void>;
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
  discoverAgents: async () => {},
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

  const discoverAgents = async (sessionId?: string) => {
    if (!windows.length) {
      // No windows available, do a full discovery instead
      return discover();
    }

    try {
      // If sessionId provided, refresh only that session
      if (sessionId) {
        const targetWindow = windows.find((w) => w.sessionId === sessionId);
        if (targetWindow) {
          try {
            const bridge = createSRPCClientBridge(
              `ws://localhost:${targetWindow.port}`,
              contract,
            );
            await bridge.connect();

            const sessionInfo = await bridge.call.getSessionInfo(
              {},
              { onUpdate: () => {} },
            );

            // Update the specific window with new agent info
            setWindows((prev) =>
              prev.map((w) =>
                w.sessionId === sessionId
                  ? { ...w, availableAgents: sessionInfo.availableAgents }
                  : w,
              ),
            );

            await bridge.close();
          } catch (error) {
            console.warn(
              `Failed to refresh agents for session ${sessionId}:`,
              error,
            );
          }
        }
      } else {
        // Refresh agents for all known windows
        const refreshPromises = windows.map(async (window) => {
          try {
            const bridge = createSRPCClientBridge(
              `ws://localhost:${window.port}`,
              contract,
            );
            await bridge.connect();

            const sessionInfo = await bridge.call.getSessionInfo(
              {},
              { onUpdate: () => {} },
            );

            await bridge.close();
            return {
              sessionId: window.sessionId,
              availableAgents: sessionInfo.availableAgents,
            };
          } catch (error) {
            console.warn(
              `Failed to refresh agents for session ${window.sessionId}:`,
              error,
            );
            return null;
          }
        });

        const results = await Promise.all(refreshPromises);

        // Update windows with new agent information
        setWindows((prev) =>
          prev.map((window) => {
            const result = results.find(
              (r) => r?.sessionId === window.sessionId,
            );
            return result
              ? { ...window, availableAgents: result.availableAgents }
              : window;
          }),
        );
      }

      // If the currently selected agent is no longer available, reset to auto
      if (selectedAgent) {
        const currentSession = selectedSessionId
          ? windows.find((w) => w.sessionId === selectedSessionId)
          : windows[0];

        if (
          currentSession &&
          !currentSession.availableAgents?.includes(selectedAgent)
        ) {
          setSelectedAgent(undefined);
        }
      }
    } catch (error) {
      console.warn('Failed to refresh agent information:', error);
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
    discoverAgents,
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
  const { availableAgents, selectedAgent, selectAgent, discoverAgents } =
    useVSCode();
  return { availableAgents, selectedAgent, selectAgent, discoverAgents };
}
