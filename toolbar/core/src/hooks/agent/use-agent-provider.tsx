// This hook is responsible for searching through all available ports every now and then and check,
// if there's an agent available

// It is then managing each of the available agents in a list and provides them to the consumer hook.
// The consumers can select an agent and will then get it returned through the agent interface.
// If the connection to an agent is lost, the hook will signal that by setting the returned agent to "null".
// If a reconnect happens without the user previously selecting another option, the hook will try to reconnect to the previously selected agent.

import type { ReactNode } from 'react';
import { createContext } from 'react';
import {
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type {
  InterfaceRouter,
  StagewiseInfo,
} from '@stagewise/agent-interface-internal/toolbar';
import { transformer } from '@stagewise/agent-interface-internal/toolbar';

interface AgentInfo {
  port: number;
  name: string;
  description: string;
  info: StagewiseInfo;
}

interface AgentProviderInterface {
  /**
   * The agent that the toolbar is currently connected to.
   */
  connected:
    | null
    | (AgentInfo & {
        agent: ReturnType<typeof createTRPCClient<InterfaceRouter>>;
      });

  /**
   * Whether the currently connected agent is unavailable (connection lost).
   */
  connectedUnavailable: boolean;

  /**
   * Whether the user's attention is required (disconnected state with 500ms delay).
   * This is true when there's no agent connected or the connected agent is unavailable,
   * but only after a 500ms delay to prevent UI flickering.
   */
  requiresUserAttention: boolean;

  /**
   * Whether the toolbar is in its initial load period (first 1 second after mount).
   * During this time, warning UI should be hidden to allow auto-connection to complete.
   */
  isInitialLoad: boolean;
}

const agentContext = createContext<AgentProviderInterface>({
  connected: null,
  connectedUnavailable: false,
  requiresUserAttention: false,
  isInitialLoad: true,
});

/**
 * Generates a unique key for an agent by concatenating name, description, and port.
 * Used for persisting agent selection in sessionStorage.
 */
function getAgentUniqueKey(agent: AgentInfo): string {
  return `${agent.name}|||${agent.description}|||${agent.port}`;
}

/**
 * Persists the selected agent to sessionStorage.
 */
function persistSelectedAgent(agent: AgentInfo): void {
  try {
    const uniqueKey = getAgentUniqueKey(agent);
    sessionStorage.setItem('stagewise_toolbar_selected_agent', uniqueKey);
    console.debug(`[AgentProvider] Persisted selected agent: ${uniqueKey}`);
  } catch (error) {
    console.warn('[AgentProvider] Failed to persist selected agent:', error);
  }
}

/**
 * Creates a tRPC WebSocket client configured to connect to an agent on the specified port.
 * Returns both the client and the underlying websocket for connection monitoring.
 * Uses a stability check to only consider connections established after they remain open for 200ms.
 */
function createWebSocketClient(
  port: number,
  onConnectionLost: () => void,
  onConnectionEstablished: () => void,
  onConnectionFailed: () => void,
  connectionStabilityTimeoutRef: React.RefObject<NodeJS.Timeout | null>,
  isAppHosted = false,
): {
  client: ReturnType<typeof createTRPCClient<InterfaceRouter>>;
  wsClient: ReturnType<typeof createWSClient>;
} {
  console.debug(
    `[AgentProvider] Creating WebSocket client for port ${port} (app-hosted: ${isAppHosted})...`,
  );

  let isConnectionStable = false;
  let connectionFailedCalled = false;

  const hostname = window.location.hostname;
  const wsPath = isAppHosted
    ? '/stagewise-toolbar-app/server/ws'
    : '/stagewise/ws';
  const wsClient = createWSClient({
    url: `ws://${hostname}:${port}${wsPath}`,
    onClose(cause) {
      console.debug(
        `[AgentProvider] WebSocket closed for port ${port}: ${cause}`,
      );

      // Clear the stability timeout if connection closes before it's considered stable
      if (connectionStabilityTimeoutRef.current && !isConnectionStable) {
        console.debug(
          `[AgentProvider] Connection closed before stability timeout - clearing timeout for port ${port}`,
        );
        clearTimeout(connectionStabilityTimeoutRef.current);
        connectionStabilityTimeoutRef.current = null;

        // For unstable connections, call onConnectionFailed to trigger retry logic
        if (!connectionFailedCalled) {
          console.debug(
            `[AgentProvider] Unstable connection detected for port ${port} - calling onConnectionFailed`,
          );
          connectionFailedCalled = true;
          onConnectionFailed();
        }
      }

      // Only call onConnectionLost if the connection was previously considered stable
      if (isConnectionStable) {
        console.debug(
          `[AgentProvider] Stable connection lost for port ${port} - calling onConnectionLost`,
        );
        onConnectionLost();
      }
    },
    onOpen() {
      console.debug(
        `[AgentProvider] WebSocket opened for port ${port} - starting stability check...`,
      );

      // Clear any existing stability timeout
      if (connectionStabilityTimeoutRef.current) {
        clearTimeout(connectionStabilityTimeoutRef.current);
      }

      // Wait 200ms to ensure the connection is stable before considering it established
      connectionStabilityTimeoutRef.current = setTimeout(() => {
        console.debug(
          `[AgentProvider] Connection stability confirmed for port ${port}`,
        );
        isConnectionStable = true;
        connectionStabilityTimeoutRef.current = null;
        onConnectionEstablished();
      }, 200);
    },
  });

  const client = createTRPCClient<InterfaceRouter>({
    links: [
      wsLink({
        client: wsClient,
        transformer: transformer,
      }),
    ],
  });

  console.debug(`[AgentProvider] WebSocket client created for port ${port}`);
  return { client, wsClient };
}

export function AgentProvider({ children }: { children?: ReactNode }) {
  console.debug('[AgentProvider] AgentProvider component initializing...');

  // ===== STATE MANAGEMENT =====
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([]);
  const connected = useRef<ReturnType<
    typeof createTRPCClient<InterfaceRouter>
  > | null>(null);
  const connectedWsClient = useRef<ReturnType<typeof createWSClient> | null>(
    null,
  );
  const [connectedPort, setConnectedPort] = useState<number | null>(null);
  const [finishedInitialScan, setFinishedInitialScan] = useState(false);
  const [connectedUnavailable, setConnectedUnavailable] = useState(false);
  const [requiresUserAttention, setRequiresUserAttention] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // ===== REFS FOR CONNECTION MANAGEMENT =====
  const previouslySelectedPortRef = useRef<number | null>(null);
  const retryIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const isManualSelectionRef = useRef<boolean>(false);
  const delayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionStabilityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAppHostedAgentRef = useRef<boolean>(false);

  // ===== RETRY LOGIC FUNCTIONS =====

  /**
   * Starts retry attempts for the specified port every 2 seconds.
   * Only retries if the connection loss wasn't due to manual user action.
   * Limited to a maximum of 5 retry attempts for regular agents.
   * App-hosted agents retry indefinitely.
   */
  const startRetryConnection = useCallback(
    (port: number) => {
      console.debug(
        `[AgentProvider] Starting retry connection logic for port ${port}...`,
      );
      // Clear any existing retry interval
      if (retryIntervalRef.current) {
        console.debug(`[AgentProvider] Clearing existing retry interval...`);
        clearInterval(retryIntervalRef.current);
      }

      // Reset retry counter for new retry session
      retryCountRef.current = 0;

      // Only start retry if this is not a manual selection change
      if (!isManualSelectionRef.current) {
        console.debug(
          `[AgentProvider] Setting up retry interval (every 2s)...`,
        );
        retryIntervalRef.current = setInterval(() => {
          if (
            previouslySelectedPortRef.current === port &&
            !connected.current &&
            !isManualSelectionRef.current
          ) {
            retryCountRef.current++;
            console.debug(
              `[AgentProvider] Retrying connection to agent on port ${port}...`,
            );
            connectAgentInternal(port, false);
          } else {
            // Stop retrying if conditions are no longer met
            console.debug(
              `[AgentProvider] Stopping retry attempts for port ${port} (conditions no longer met)`,
            );
            if (retryIntervalRef.current) {
              clearInterval(retryIntervalRef.current);
              retryIntervalRef.current = undefined;
            }
          }
        }, 2000); // Retry every 2 seconds
      } else {
        console.debug(
          `[AgentProvider] Skipping retry setup - this was a manual selection change`,
        );
      }
    },
    [connected, availableAgents],
  );

  /**
   * Stops any ongoing retry attempts.
   */
  const stopRetryConnection = useCallback(() => {
    if (retryIntervalRef.current) {
      console.debug(`[AgentProvider] Stopping retry connection attempts...`);
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = undefined;
    }
  }, []);

  // ===== CONNECTION MANAGEMENT =====

  /**
   * Internal connection function that handles both manual and automatic connections.
   * Sets up health monitoring and retry logic based on connection type.
   */
  const connectAgentInternal = useCallback(
    async (port: number, isManual = false) => {
      console.debug(
        `[AgentProvider] Attempting to connect to agent on port ${port} (manual: ${isManual})...`,
      );

      // Set the previously selected port immediately to enable retry logic
      previouslySelectedPortRef.current = port;
      isManualSelectionRef.current = isManual;

      try {
        // Stop any ongoing retry attempts
        stopRetryConnection();

        if (connected.current) {
          // Clean up existing connection
          console.debug(
            `[AgentProvider] Cleaning up existing connection (port ${connectedPort})...`,
          );

          // Clear any pending connection stability timeout
          if (connectionStabilityTimeoutRef.current) {
            clearTimeout(connectionStabilityTimeoutRef.current);
            connectionStabilityTimeoutRef.current = null;
          }

          // Explicitly close WebSocket connection to prevent connection leaks
          const wsClient = connectedWsClient.current;
          if (wsClient) {
            try {
              console.debug(
                `[AgentProvider] Explicitly closing existing WebSocket connection`,
              );
              wsClient.close();
            } catch (error) {
              console.debug(
                '[AgentProvider] Error closing existing WebSocket:',
                error,
              );
            }
          }

          connected.current = null;
          connectedWsClient.current = null;
          setConnectedPort(null);

          // Small delay to ensure WebSocket is fully closed before creating new connection
          await new Promise((resolve) => setTimeout(resolve, 100));
          console.debug(`[AgentProvider] WebSocket cleanup delay complete`);
        }

        const { client, wsClient } = createWebSocketClient(
          port,
          () => {
            console.debug(
              `[AgentProvider] Connection lost to agent on port ${port}`,
            );
            setConnectedUnavailable(true);

            // Explicitly close WebSocket connection on connection loss
            const wsClient = connectedWsClient.current;
            if (wsClient) {
              try {
                console.debug(
                  `[AgentProvider] Explicitly closing WebSocket after connection loss`,
                );
                wsClient.close();
              } catch (error) {
                console.debug(
                  '[AgentProvider] Error closing WebSocket after connection loss:',
                  error,
                );
              }
            }

            connected.current = null;
            connectedWsClient.current = null;
            setConnectedPort(null);

            console.debug(
              `[AgentProvider] App-hosted agent disconnected, starting permanent retry...`,
            );
            startRetryConnection(port);
          },
          () => {
            console.debug(
              `[AgentProvider] Connection established to agent on port ${port}`,
            );
            setConnectedPort(port);
            setConnectedUnavailable(false); // Reset unavailable state on successful connection

            // Reset retry counter on successful connection
            retryCountRef.current = 0;

            // Clear initial load state immediately upon successful connection
            setIsInitialLoad(false);

            // Persist the agent selection for automatic connections (like single agent auto-connect)
            // Manual connections are already persisted in connectAgent
            if (!isManual) {
              const agentToPersist = availableAgents.find(
                (agent) => agent.port === port,
              );
              if (agentToPersist) {
                persistSelectedAgent(agentToPersist);
              }
            }

            // No need to refresh agent list after successful connection
            console.debug(
              `[AgentProvider] Connection established successfully, no need to rescan agents`,
            );
          },
          () => {
            console.debug(
              `[AgentProvider] Connection failed for agent on port ${port} (unstable)`,
            );

            // Clean up the failed connection state
            connected.current = null;
            connectedWsClient.current = null;
            setConnectedPort(null);
            setConnectedUnavailable(true);

            // Start retry attempts if this wasn't a manual selection
            if (!isManual) {
              console.debug(
                `[AgentProvider] Starting retry attempts for unstable connection on port ${port}...`,
              );
              startRetryConnection(port);
            }
          },
          connectionStabilityTimeoutRef,
        );
        connected.current = client;
        connectedWsClient.current = wsClient;

        console.debug(
          `[AgentProvider] WebSocket client created for port ${port} - waiting for stability confirmation...`,
        );
      } catch (error) {
        console.error(
          `[AgentProvider] Failed to connect to agent on port ${port}:`,
          error,
        );

        // Clear any pending connection stability timeout
        if (connectionStabilityTimeoutRef.current) {
          clearTimeout(connectionStabilityTimeoutRef.current);
          connectionStabilityTimeoutRef.current = null;
        }

        // Explicitly clean up any partial WebSocket connection on failure
        const wsClient = connectedWsClient.current;
        if (wsClient) {
          try {
            console.debug(
              `[AgentProvider] Explicitly closing WebSocket after connection failure`,
            );
            wsClient.close();
          } catch (closeError) {
            console.debug(
              '[AgentProvider] Error closing WebSocket after connection failure:',
              closeError,
            );
          }
        }

        connected.current = null;
        connectedWsClient.current = null;
        setConnectedPort(null);
        setConnectedUnavailable(true);

        // Start retry attempts if this wasn't a manual selection and connection failed
        if (!isManual) {
          console.debug(
            `[AgentProvider] Failed to connect to agent on port ${port}, starting retry attempts...`,
          );
          startRetryConnection(port);
        }
      }
    },
    [connectedPort, startRetryConnection, stopRetryConnection, availableAgents],
  );

  // ===== LIFECYCLE EFFECTS =====

  // Log state changes
  useEffect(() => {
    console.debug(
      `[AgentProvider] State change - Available agents: ${availableAgents.length}`,
      availableAgents.map((a) => `${a.name} (${a.port})`),
    );
  }, [availableAgents]);

  useEffect(() => {
    console.debug(
      `[AgentProvider] Connection state changed: ${connected ? `Connected to port ${connectedPort}` : 'Not connected'}`,
    );
  }, [connected, connectedPort]);

  // Initial scan on mount - check config for app-hosted agent
  useEffect(() => {
    // Only run on initial mount
    if (!finishedInitialScan) {
      console.debug(
        '[AgentProvider] Config indicates Stagewise agent usage, connecting to app port...',
      );

      // Get the current port from the URL
      const url = new URL(window.location.href);
      const appPort = Number.parseInt(url.port);

      // Create a fake agent info for the app-hosted agent
      const appAgent: AgentInfo = {
        port: appPort,
        name: 'Stagewise CLI Agent',
        description: 'Integrated with application',
        info: {
          name: 'Stagewise CLI Agent',
          description: 'Integrated with application',
          capabilities: {
            toolCalling: true,
            chatHistory: true,
          },
        },
      };

      isAppHostedAgentRef.current = true;
      setAvailableAgents([appAgent]); // Only show the app-hosted agent
      setFinishedInitialScan(true);

      // Connect to the app-hosted agent
      setTimeout(() => {
        connectAgentInternal(appPort, false);
      }, 10);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to run only once on mount

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsInitialLoad(false);
    }, 1000);
    return () => clearTimeout(timeout);
  }, []);

  // Handle 500ms delay for requiresUserAttention
  useEffect(() => {
    const isConnectedAndAvailable = connected.current && !connectedUnavailable;

    if (isConnectedAndAvailable) {
      // Agent is connected and available - immediately clear attention requirement
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current);
        delayTimeoutRef.current = null;
      }
      setRequiresUserAttention(false);
    } else {
      // Agent is disconnected or unavailable - start 500ms delay
      if (!delayTimeoutRef.current) {
        delayTimeoutRef.current = setTimeout(() => {
          setRequiresUserAttention(true);
          delayTimeoutRef.current = null;
        }, 500);
      }
    }

    // Cleanup timeout
    return () => {
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current);
        delayTimeoutRef.current = null;
      }
    };
  }, [connectedPort, connectedUnavailable]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.debug('[AgentProvider] Component unmounting, cleaning up...');
      stopRetryConnection();
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current);
      }
      if (connectionStabilityTimeoutRef.current) {
        clearTimeout(connectionStabilityTimeoutRef.current);
      }

      // Explicitly close WebSocket connection on unmount to prevent memory leaks
      const wsClient = connectedWsClient.current;
      if (wsClient) {
        try {
          console.debug(
            '[AgentProvider] Explicitly closing WebSocket connection on unmount',
          );
          wsClient.close();
        } catch (error) {
          console.debug(
            '[AgentProvider] Error closing WebSocket on unmount:',
            error,
          );
        }
      }

      console.debug('[AgentProvider] Cleanup complete');
    };
  }, [stopRetryConnection]);

  // ===== PROVIDER INTERFACE =====

  const agentGetter = useMemo(() => {
    return {
      agent: connected.current,
    };
  }, [connectedPort]);

  /**
   * Memoized provider value to prevent unnecessary re-renders.
   */
  const providerInterface = useMemo(
    (): AgentProviderInterface => ({
      connected: connected.current
        ? {
            agent: connected.current,
            ...availableAgents.find((a) => a.port === connectedPort),
          }
        : null,
      connectedUnavailable,
      requiresUserAttention,
      isInitialLoad,
    }),
    [agentGetter, connectedUnavailable, requiresUserAttention, isInitialLoad],
  );

  return (
    <agentContext.Provider value={providerInterface}>
      {children}
    </agentContext.Provider>
  );
}

export const useAgents = () => useContext(agentContext);
