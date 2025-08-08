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
} from '@stagewise/agent-interface/toolbar';
import {
  DEFAULT_STARTING_PORT,
  transformer,
} from '@stagewise/agent-interface/toolbar';
import { useConfig } from '@/hooks/use-config';

interface AgentInfo {
  port: number;
  name: string;
  description: string;
  info: StagewiseInfo;
  isAppHosted?: boolean;
}

interface AgentProviderInterface {
  /**
   * Show a list of all agents that are available to connect to.
   */
  availableAgents: AgentInfo[];

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

  /**
   * Connect to an agent.
   */
  connectAgent: (port: number) => void;

  /**
   * Disconnect from the currently connected agent.
   */
  disconnectAgent: () => void;

  /**
   * Refresh the list of available agents.
   */
  refreshAgentList: () => void;

  /**
   * Whether the agent list is currently being refreshed.
   */
  isRefreshing: boolean;
}

const agentContext = createContext<AgentProviderInterface>({
  availableAgents: [],
  connected: null,
  connectedUnavailable: false,
  requiresUserAttention: false,
  isInitialLoad: true,
  connectAgent: () => {},
  disconnectAgent: () => {},
  refreshAgentList: () => {},
  isRefreshing: false,
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
 * Retrieves the persisted agent key from sessionStorage.
 */
function getPersistedAgentKey(): string | null {
  try {
    return sessionStorage.getItem('stagewise_toolbar_selected_agent');
  } catch (error) {
    console.warn('[AgentProvider] Failed to retrieve persisted agent:', error);
    return null;
  }
}

/**
 * Finds an agent matching the persisted key from the list of available agents.
 */
function findPersistedAgent(availableAgents: AgentInfo[]): AgentInfo | null {
  const persistedKey = getPersistedAgentKey();
  if (!persistedKey) {
    return null;
  }

  const matchingAgent = availableAgents.find(
    (agent) => getAgentUniqueKey(agent) === persistedKey,
  );

  if (matchingAgent) {
    console.debug(
      `[AgentProvider] Found persisted agent: ${matchingAgent.name} (port ${matchingAgent.port})`,
    );
  }

  return matchingAgent || null;
}

/**
 * Checks if an agent is available on the specified port by calling the /stagewise/info endpoint.
 * Returns agent information if successful, null otherwise.
 */
async function checkAgentOnPort(
  port: number,
  path = '/stagewise/info',
): Promise<AgentInfo | null> {
  console.debug(
    `[AgentProvider] Checking for agent on port ${port} at path ${path}...`,
  );
  try {
    // We use the hostname of the open page to connect to the agent
    const hostname = window.location.hostname;
    const response = await fetch(`http://${hostname}:${port}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(2000), // 2 second timeout
    });

    if (response.ok) {
      const info: StagewiseInfo = await response.json();
      // Validate that it's a valid StagewiseInfo object
      if (
        info &&
        typeof info.name === 'string' &&
        typeof info.description === 'string' &&
        info.capabilities
      ) {
        // Validate that it's a valid StagewiseInfo object
        console.debug(
          `[AgentProvider] Found agent "${info.name}" on port ${port}: ${info.description}`,
        );
        return {
          port,
          name: info.name,
          description: info.description,
          info,
        };
      } else {
        console.warn(
          `[AgentProvider] Invalid agent info received on port ${port}`,
        );
      }
    } else {
      console.debug(
        `[AgentProvider] HTTP ${response.status} response on port ${port}`,
      );
    }
  } catch (error) {
    // Only log if it's not a timeout or common network error
    if (error instanceof Error && !error.message.includes('timeout')) {
      console.debug(
        `[AgentProvider] Error checking port ${port}: ${error.message}`,
      );
    }
  }
  return null;
}

/**
 * Scans for available agents starting from the specified port.
 * Uses an intelligent scanning strategy that continues searching if agents are found near the end of scan ranges.
 */
async function scanForAgents(
  startPort: number = DEFAULT_STARTING_PORT,
): Promise<AgentInfo[]> {
  console.info(
    "[stagewise] The following errors are expected ✅\n\nThey happen because we're searching for available agents...",
  );
  console.debug(
    `[AgentProvider] Starting agent scan from port ${startPort}...`,
  );
  const agents: AgentInfo[] = [];
  let currentPort = startPort;
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 2;
  const initialScanCount = 2;
  const expandedScanCount = 1;

  // Initial scan of {initialScanCount} ports
  for (let i = 0; i < initialScanCount; i++) {
    const agent = await checkAgentOnPort(currentPort);
    if (agent) {
      agents.push(agent);
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
    }
    currentPort++;
  }

  // Continue scanning in chunks of {expandedScanCount} if agents were found in the last few ports
  while (consecutiveFailures < maxConsecutiveFailures) {
    let foundInThisChunk = false;

    for (let i = 0; i < expandedScanCount; i++) {
      const agent = await checkAgentOnPort(currentPort);
      if (agent) {
        agents.push(agent);
        foundInThisChunk = true;
        consecutiveFailures = 0;
      }
      currentPort++;
    }

    if (!foundInThisChunk) {
      consecutiveFailures++;
    }
  }

  console.debug(
    `[AgentProvider] Scan complete! Found ${agents.length} total agents:`,
    agents.map((a) => `${a.name} (port ${a.port})`),
  );
  return agents;
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

  const { config } = useConfig();
  const usesStagewiseAgent = config?.usesStagewiseAgent || false;

  // ===== STATE MANAGEMENT =====
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([]);
  const connected = useRef<ReturnType<
    typeof createTRPCClient<InterfaceRouter>
  > | null>(null);
  const connectedWsClient = useRef<ReturnType<typeof createWSClient> | null>(
    null,
  );
  const [connectedPort, setConnectedPort] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
        const agentInfo = availableAgents.find((a) => a.port === port);
        const isAppHosted = agentInfo?.isAppHosted || false;

        console.debug(
          `[AgentProvider] Setting up retry interval (every 2s) for port ${port} ${isAppHosted ? '(app-hosted, unlimited retries)' : '(max 5 retries)'}...`,
        );
        retryIntervalRef.current = setInterval(() => {
          // Check if we've reached the retry limit (only for non-app-hosted agents)
          if (!isAppHosted && retryCountRef.current >= 5) {
            console.debug(
              `[AgentProvider] Maximum retry attempts (5) reached for port ${port}, stopping retries`,
            );
            if (retryIntervalRef.current) {
              clearInterval(retryIntervalRef.current);
              retryIntervalRef.current = undefined;
            }
            return;
          }

          if (
            previouslySelectedPortRef.current === port &&
            !connected.current &&
            !isManualSelectionRef.current
          ) {
            retryCountRef.current++;
            console.debug(
              `[AgentProvider] Retrying connection to agent on port ${port} (attempt ${retryCountRef.current}${isAppHosted ? '' : '/5'})...`,
            );
            connectAgentInternal(port, false, isAppHosted); // Pass isAppHosted flag
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

  // ===== AGENT SCANNING =====

  /**
   * Scans for available agents and updates the state.
   * Also handles auto-connection logic for single agent scenarios.
   */
  const scanAgents = useCallback(async () => {
    // Don't scan if we're using an app-hosted agent
    if (usesStagewiseAgent) {
      console.debug(
        '[AgentProvider] Skipping agent scan - using app-hosted agent',
      );
      return;
    }

    console.debug(
      `[AgentProvider] Starting agent scan... (finishedInitialScan: ${finishedInitialScan}, connected: ${!!connected.current})`,
    );
    setIsRefreshing(true);
    try {
      const agents = await scanForAgents();

      // Log changes in available agents
      const previousCount = availableAgents.length;
      const newCount = agents.length;
      if (previousCount !== newCount) {
        console.debug(
          `[AgentProvider] Available agents changed: ${previousCount} → ${newCount}`,
        );
      }

      setAvailableAgents(agents);

      console.debug(
        `[AgentProvider] Scanned: ${agents.length} agents found, connected: ${!!connected.current}`,
      );
      console.debug(
        `[AgentProvider] finishedInitialScan: ${finishedInitialScan}, connected: ${!!connected.current}`,
      );

      // Check for persisted agent first when initially scanning and no agent is connected
      if (!finishedInitialScan && !connected.current && agents.length > 0) {
        const persistedAgent = findPersistedAgent(agents);
        if (persistedAgent) {
          console.debug(
            `[AgentProvider] Auto-connecting to persisted agent: ${persistedAgent.name} (port ${persistedAgent.port})`,
          );
          connectAgentInternal(persistedAgent.port, false); // false = not manual selection
        } else if (agents.length === 1) {
          // Auto-connect if exactly one agent is found and no persisted agent
          console.debug(
            `[AgentProvider] Auto-connecting to single available agent: ${agents[0].name} (port ${agents[0].port})`,
          );
          connectAgentInternal(agents[0].port, false); // false = not manual selection
        }
      }

      // Try to reconnect to previously selected agent if connection was lost
      if (
        !connected &&
        previouslySelectedPortRef.current &&
        !isManualSelectionRef.current
      ) {
        const previousAgent = agents.find(
          (agent) => agent.port === previouslySelectedPortRef.current,
        );
        if (previousAgent) {
          console.debug(
            `[AgentProvider] Attempting to reconnect to previously selected agent: ${previousAgent.name} (port ${previousAgent.port})`,
          );
          connectAgentInternal(previousAgent.port, false); // false = not manual selection
        } else {
          console.debug(
            `[AgentProvider] Previously selected agent (port ${previouslySelectedPortRef.current}) is no longer available`,
          );
        }
      }
    } catch (error) {
      console.error('[AgentProvider] Failed to scan for agents:', error);
    } finally {
      setIsRefreshing(false);
      setFinishedInitialScan(true);
      console.debug(`[AgentProvider] Agent scan complete. Refreshing: false`);
    }
  }, [
    connected,
    finishedInitialScan,
    availableAgents.length,
    usesStagewiseAgent,
  ]);

  // ===== CONNECTION MANAGEMENT =====

  /**
   * Internal connection function that handles both manual and automatic connections.
   * Sets up health monitoring and retry logic based on connection type.
   */
  const connectAgentInternal = useCallback(
    async (port: number, isManual = false, _forceAppHosted = false) => {
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

            // Start retry attempts if this wasn't a manual disconnection
            if (!isManualSelectionRef.current) {
              console.debug(
                `[AgentProvider] Starting retry attempts for port ${port}...`,
              );
              startRetryConnection(port);

              // Only scan for agents once when connection is first lost
              console.info(
                `[stagewise] Searching for available agents after connection loss...`,
              );
              scanAgents();
            } else {
              console.debug(
                `[AgentProvider] Not starting retry attempts (manual disconnection)`,
              );
              // Scan for agents even on manual disconnection to update the list
              scanAgents();
            }
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
    [
      connectedPort,
      startRetryConnection,
      stopRetryConnection,
      scanAgents,
      availableAgents,
    ],
  );

  // ===== PUBLIC API FUNCTIONS =====

  /**
   * Disconnects from the currently connected agent and stops all retry attempts.
   */
  const disconnectAgent = useCallback(() => {
    console.debug(
      `[AgentProvider] Manual disconnect requested (current port: ${connectedPort})...`,
    );
    // Stop any retry attempts
    stopRetryConnection();

    // Clear any pending connection stability timeout
    if (connectionStabilityTimeoutRef.current) {
      clearTimeout(connectionStabilityTimeoutRef.current);
      connectionStabilityTimeoutRef.current = null;
    }

    // Explicitly clean up WebSocket connection to prevent memory leaks
    const wsClient = connectedWsClient.current;
    if (wsClient) {
      try {
        console.debug(
          `[AgentProvider] Explicitly closing WebSocket for manual disconnect`,
        );
        wsClient.close();
      } catch (error) {
        console.debug(
          '[AgentProvider] Error closing WebSocket during manual disconnect:',
          error,
        );
      }
    }

    connected.current = null;
    connectedWsClient.current = null;
    setConnectedPort(null);
    setConnectedUnavailable(false); // Reset unavailable state on manual disconnect
    previouslySelectedPortRef.current = null;
    isManualSelectionRef.current = true; // Mark as manual action
    console.debug(`[AgentProvider] Successfully disconnected from agent`);
  }, [connectedPort, stopRetryConnection]);

  /**
   * Connects to an agent on the specified port (considered a manual user action).
   */
  const connectAgent = useCallback(
    (port: number) => {
      console.debug(
        `[AgentProvider] Manual connection requested to port ${port}...`,
      );

      // Find the agent to persist its selection
      const agentToPersist = availableAgents.find(
        (agent) => agent.port === port,
      );
      if (agentToPersist) {
        persistSelectedAgent(agentToPersist);
      }

      // Stop any ongoing retry attempts since this is a manual selection
      stopRetryConnection();
      // Reset manual selection flag after a brief moment to allow future automatic reconnections
      setTimeout(() => {
        console.debug(
          `[AgentProvider] Resetting manual selection flag to allow future auto-reconnects...`,
        );
        isManualSelectionRef.current = false;
      }, 100);
      connectAgentInternal(port, true); // true = manual selection
    },
    [connectAgentInternal, stopRetryConnection, availableAgents],
  );

  /**
   * Refreshes the list of available agents by rescanning ports.
   */
  const refreshAgentList = useCallback(() => {
    // Don't allow refresh for app-hosted agents
    if (usesStagewiseAgent) {
      console.debug('[AgentProvider] Refresh blocked - using app-hosted agent');
      return;
    }

    console.debug(`[AgentProvider] Manual refresh of agent list requested...`);
    scanAgents();
  }, [scanAgents, usesStagewiseAgent]);

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

  useEffect(() => {
    console.debug(`[AgentProvider] Refreshing state changed: ${isRefreshing}`);
  }, [isRefreshing]);

  // Initial scan on mount - check config for app-hosted agent
  useEffect(() => {
    // Only run on initial mount
    if (!finishedInitialScan) {
      console.debug(
        '[AgentProvider] Component mounted, checking configuration...',
      );

      if (usesStagewiseAgent) {
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
          isAppHosted: true,
        };

        setAvailableAgents([appAgent]); // Only show the app-hosted agent
        setFinishedInitialScan(true);

        // Connect to the app-hosted agent
        setTimeout(() => {
          connectAgentInternal(appPort, false, true); // true = force app-hosted
        }, 10);

        // For app-hosted agents, we don't scan for other agents
        return;
      }

      // No app-hosted agent configured, proceed with normal scanning
      console.debug(
        '[AgentProvider] No Stagewise agent configured, scanning for regular agents...',
      );
      scanAgents();
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
      availableAgents,
      connected: connected.current
        ? {
            agent: connected.current,
            ...availableAgents.find((a) => a.port === connectedPort),
          }
        : null,
      connectedUnavailable,
      requiresUserAttention,
      isInitialLoad,
      connectAgent,
      disconnectAgent,
      refreshAgentList,
      isRefreshing,
    }),
    [
      availableAgents,
      agentGetter,
      connectAgent,
      disconnectAgent,
      refreshAgentList,
      isRefreshing,
      connectedUnavailable,
      requiresUserAttention,
      isInitialLoad,
    ],
  );

  return (
    <agentContext.Provider value={providerInterface}>
      {children}
    </agentContext.Provider>
  );
}

export const useAgents = () => useContext(agentContext);
