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
  connected: ReturnType<typeof createTRPCClient<InterfaceRouter>> | null;

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
): {
  client: ReturnType<typeof createTRPCClient<InterfaceRouter>>;
  wsClient: ReturnType<typeof createWSClient>;
} {
  console.debug(`[AgentProvider] Creating WebSocket client for...`);

  let isConnectionStable = false;
  let connectionFailedCalled = false;

  const hostname = window.location.hostname;
  const wsPath = '/stagewise-toolbar-app/server/ws';
  const wsClient = createWSClient({
    url: `ws://${hostname}:${port}${wsPath}`,
    onClose(cause) {
      console.debug(`[AgentProvider] WebSocket closed: ${cause}`);

      // Clear the stability timeout if connection closes before it's considered stable
      if (connectionStabilityTimeoutRef.current && !isConnectionStable) {
        console.debug(
          `[AgentProvider] Connection closed before stability timeout - clearing timeout`,
        );
        clearTimeout(connectionStabilityTimeoutRef.current);
        connectionStabilityTimeoutRef.current = null;

        // For unstable connections, call onConnectionFailed to trigger retry logic
        if (!connectionFailedCalled) {
          console.debug(
            `[AgentProvider] Unstable connection detected - calling onConnectionFailed`,
          );
          connectionFailedCalled = true;
          onConnectionFailed();
        }
      }

      // Only call onConnectionLost if the connection was previously considered stable
      if (isConnectionStable) {
        console.debug(
          `[AgentProvider] Stable connection lost - calling onConnectionLost`,
        );
        onConnectionLost();
      }
    },
    onOpen() {
      console.debug(
        `[AgentProvider] WebSocket opened for - starting stability check...`,
      );

      // Clear any existing stability timeout
      if (connectionStabilityTimeoutRef.current) {
        clearTimeout(connectionStabilityTimeoutRef.current);
      }

      // Wait 200ms to ensure the connection is stable before considering it established
      connectionStabilityTimeoutRef.current = setTimeout(() => {
        console.debug(`[AgentProvider] Connection stability confirmed`);
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

  console.debug(`[AgentProvider] WebSocket client created`);
  return { client, wsClient };
}

export function AgentProvider({ children }: { children?: ReactNode }) {
  console.debug('[AgentProvider] AgentProvider component initializing...');

  // ===== STATE MANAGEMENT =====
  const [isConnected, setIsConnected] = useState(false);
  const connected = useRef<ReturnType<
    typeof createTRPCClient<InterfaceRouter>
  > | null>(null);
  const connectedWsClient = useRef<ReturnType<typeof createWSClient> | null>(
    null,
  );
  const [connectedUnavailable, setConnectedUnavailable] = useState(false);
  const [requiresUserAttention, setRequiresUserAttention] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // ===== REFS FOR CONNECTION MANAGEMENT =====
  const retryIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const isManualSelectionRef = useRef<boolean>(false);
  const delayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionStabilityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ===== RETRY LOGIC FUNCTIONS =====
  const startRetryConnection = useCallback(
    (port: number) => {
      console.debug(`[AgentProvider] Starting retry connection logic...`);
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
          if (!connected && !isManualSelectionRef.current) {
            retryCountRef.current++;
            console.debug(`[AgentProvider] Retrying connection to agent...`);
            connectAgentInternal(port);
          } else {
            // Stop retrying if conditions are no longer met
            console.debug(
              `[AgentProvider] Stopping retry attempts (conditions no longer met)`,
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
    [connected],
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
    async (port: number) => {
      console.debug(`[AgentProvider] Attempting to connect to agent...`);

      try {
        // Stop any ongoing retry attempts
        stopRetryConnection();

        if (connected) {
          // Clean up existing connection
          console.debug(`[AgentProvider] Cleaning up existing connection...`);

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
          setIsConnected(false);
          connectedWsClient.current = null;

          // Small delay to ensure WebSocket is fully closed before creating new connection
          await new Promise((resolve) => setTimeout(resolve, 100));
          console.debug(`[AgentProvider] WebSocket cleanup delay complete`);
        }

        const { client, wsClient } = createWebSocketClient(
          port,
          () => {
            console.debug(`[AgentProvider] Connection lost to agent`);
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
            setIsConnected(false);
            connectedWsClient.current = null;

            console.debug(
              `[AgentProvider] App-hosted agent disconnected, starting permanent retry...`,
            );
            startRetryConnection(port);
          },
          () => {
            console.debug(`[AgentProvider] Connection established to agent`);
            setConnectedUnavailable(false); // Reset unavailable state on successful connection

            // Reset retry counter on successful connection
            retryCountRef.current = 0;

            // Clear initial load state immediately upon successful connection
            setIsInitialLoad(false);

            // No need to refresh agent list after successful connection
            console.debug(
              `[AgentProvider] Connection established successfully, no need to rescan agents`,
            );
          },
          () => {
            console.debug(
              `[AgentProvider] Connection failed for agent (unstable)`,
            );

            // Clean up the failed connection state
            connected.current = null;
            connectedWsClient.current = null;
            setIsConnected(false);
            setConnectedUnavailable(true);

            startRetryConnection(port);
          },
          connectionStabilityTimeoutRef,
        );
        connected.current = client;
        connectedWsClient.current = wsClient;
        setIsConnected(true);

        console.debug(
          `[AgentProvider] WebSocket client created - waiting for stability confirmation...`,
        );
      } catch (error) {
        console.error(`[AgentProvider] Failed to connect to agent:`, error);

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
        setConnectedUnavailable(true);
        setIsConnected(false);

        console.debug(
          `[AgentProvider] Failed to connect to agent, starting retry attempts...`,
        );
        startRetryConnection(port);
      }
    },
    [startRetryConnection, stopRetryConnection],
  );

  // ===== LIFECYCLE EFFECTS =====

  useEffect(() => {
    console.debug(
      `[AgentProvider] Connection state changed: ${connected ? `Connected` : 'Not connected'}`,
    );
  }, [connected]);

  // Initial scan on mount - check config for app-hosted agent
  useEffect(() => {
    const url = new URL(window.location.href);
    const appPort = Number.parseInt(url.port);

    connectAgentInternal(appPort);
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
    const isConnectedAndAvailable = connected && !connectedUnavailable;

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
  }, [connectedUnavailable, connected]);

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

  /**
   * Memoized provider value to prevent unnecessary re-renders.
   */
  const providerInterface = useMemo(
    (): AgentProviderInterface => ({
      connected: isConnected ? connected.current : null,
      connectedUnavailable,
      requiresUserAttention,
      isInitialLoad,
    }),
    [connected, connectedUnavailable, requiresUserAttention, isInitialLoad],
  );

  return (
    <agentContext.Provider value={providerInterface}>
      {children}
    </agentContext.Provider>
  );
}

export const useAgents = () => useContext(agentContext);
