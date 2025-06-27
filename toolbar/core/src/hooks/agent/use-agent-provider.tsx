// This hook is responsible for searching through all available ports every now and then and check,
// if there's an agent available

// It is then managing each of the available agents in a list and provides them to the consumer hook.
// The consumers can select an agent and will then get it returned through the agent interface.
// If the connection to an agent is lost, the hook will signal that by setting the returned agent to "null".
// If a reconnect happens without the user previously selecting another option, the hook will try to reconnect to the previously selected agent.

import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import {
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'preact/hooks';
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type {
  InterfaceRouter,
  StagewiseInfo,
} from '@stagewise/agent-interface/toolbar';
import {
  DEFAULT_STARTING_PORT,
  transformer,
} from '@stagewise/agent-interface/toolbar';

interface AgentInfo {
  port: number;
  name: string;
  description: string;
  info: StagewiseInfo;
}

interface AgentProviderInterface {
  /**
   * Show a list of all agents that are available to connect to.
   */
  availableAgents: AgentInfo[];

  /**
   * The agent that the toolbar is currently connected to.
   */
  connected: ReturnType<typeof createTRPCClient<InterfaceRouter>> | null;

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

  /**
   * The port of the currently connected agent.
   */
  connectedPort: number | null;
}

const agentContext = createContext<AgentProviderInterface>({
  availableAgents: [],
  connected: null,
  connectAgent: () => {},
  disconnectAgent: () => {},
  refreshAgentList: () => {},
  isRefreshing: false,
  connectedPort: null,
});

/**
 * Checks if an agent is available on the specified port by calling the /stagewise/info endpoint.
 * Returns agent information if successful, null otherwise.
 */
async function checkAgentOnPort(port: number): Promise<AgentInfo | null> {
  console.log(`[AgentProvider] Checking for agent on port ${port}...`);
  try {
    const response = await fetch(`http://localhost:${port}/stagewise/info`, {
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
        console.log(
          `[AgentProvider] ✅ Found agent "${info.name}" on port ${port}: ${info.description}`,
        );
        return {
          port,
          name: info.name,
          description: info.description,
          info,
        };
      } else {
        console.log(
          `[AgentProvider] ❌ Invalid agent info received on port ${port}`,
        );
      }
    } else {
      console.log(
        `[AgentProvider] ❌ HTTP ${response.status} response on port ${port}`,
      );
    }
  } catch (error) {
    // Only log if it's not a timeout or common network error
    if (error instanceof Error && !error.message.includes('timeout')) {
      console.log(
        `[AgentProvider] ❌ Error checking port ${port}: ${error.message}`,
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
  console.log(
    `[AgentProvider] 🔍 Starting agent scan from port ${startPort}...`,
  );
  const agents: AgentInfo[] = [];
  let currentPort = startPort;
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 2;
  const initialScanCount = 10;
  const expandedScanCount = 5;

  // Initial scan of 10 ports
  console.log(`[AgentProvider] Scanning initial ${initialScanCount} ports...`);
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

  console.log(
    `[AgentProvider] Initial scan complete. Found ${agents.length} agents. Consecutive failures: ${consecutiveFailures}`,
  );

  // Continue scanning in chunks of 5 if agents were found in the last few ports
  while (consecutiveFailures < maxConsecutiveFailures) {
    console.log(
      `[AgentProvider] Extending scan with ${expandedScanCount} more ports...`,
    );
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
    console.log(
      `[AgentProvider] Extended scan chunk complete. Found ${foundInThisChunk ? 'agents' : 'no agents'}. Consecutive failures: ${consecutiveFailures}`,
    );
  }

  console.log(
    `[AgentProvider] 🎯 Scan complete! Found ${agents.length} total agents:`,
    agents.map((a) => `${a.name} (port ${a.port})`),
  );
  return agents;
}

/**
 * Creates a tRPC WebSocket client configured to connect to an agent on the specified port.
 */
function createWebSocketClient(
  port: number,
): ReturnType<typeof createTRPCClient<InterfaceRouter>> {
  console.log(
    `[AgentProvider] 🔌 Creating WebSocket client for port ${port}...`,
  );
  const wsClient = createWSClient({
    url: `ws://localhost:${port}/stagewise/ws`,
  });

  const client = createTRPCClient<InterfaceRouter>({
    links: [
      wsLink({
        client: wsClient,
        transformer: transformer,
      }),
    ],
  });

  console.log(`[AgentProvider] ✅ WebSocket client created for port ${port}`);
  return client;
}

/**
 * Utility function to set up connection health monitoring for a given tRPC client.
 * Returns a cleanup function to cancel the monitoring.
 */
function setupConnectionHealthCheck(
  client: ReturnType<typeof createTRPCClient<InterfaceRouter>>,
  port: number,
  onConnectionLost: () => void,
): () => void {
  console.log(`[AgentProvider] 💓 Setting up health check for port ${port}...`);
  const timeout = setTimeout(() => {
    console.log(
      `[AgentProvider] 🔍 Starting health check subscription for port ${port}...`,
    );
    // Simple connection health check - try to call a basic method
    const subscription = client.availability.getAvailability.subscribe(
      undefined,
      {
        onError: (error) => {
          console.log(
            `[AgentProvider] ❌ Health check error for port ${port}:`,
            error,
          );
          onConnectionLost();
        },
        onComplete: () => {
          console.log(
            `[AgentProvider] ✅ Health check completed for port ${port}`,
          );
          onConnectionLost();
        },
      },
    );

    // Clean up subscription after a short time (it's just for health check)
    setTimeout(() => {
      console.log(
        `[AgentProvider] 🧹 Cleaning up health check subscription for port ${port}`,
      );
      subscription.unsubscribe();
    }, 1000);
  }, 5000);

  // Return cleanup function
  return () => {
    console.log(
      `[AgentProvider] 🧹 Cancelling health check timeout for port ${port}`,
    );
    clearTimeout(timeout);
  };
}

export function AgentProvider({ children }: { children?: ComponentChildren }) {
  console.log('[AgentProvider] 🚀 AgentProvider component initializing...');

  // ===== STATE MANAGEMENT =====
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([]);
  const [connected, setConnected] = useState<ReturnType<
    typeof createTRPCClient<InterfaceRouter>
  > | null>(null);
  const [connectedPort, setConnectedPort] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasInitialScan, setHasInitialScan] = useState(false);

  // ===== REFS FOR CONNECTION MANAGEMENT =====
  const previouslySelectedPortRef = useRef<number | null>(null);
  const connectionTimeoutRef = useRef<() => void>();
  const retryIntervalRef = useRef<NodeJS.Timeout>();
  const isManualSelectionRef = useRef<boolean>(false);

  // ===== RETRY LOGIC FUNCTIONS =====

  /**
   * Starts retry attempts for the specified port every 2 seconds.
   * Only retries if the connection loss wasn't due to manual user action.
   */
  const startRetryConnection = useCallback(
    (port: number) => {
      console.log(
        `[AgentProvider] 🔄 Starting retry connection logic for port ${port}...`,
      );
      // Clear any existing retry interval
      if (retryIntervalRef.current) {
        console.log(`[AgentProvider] 🧹 Clearing existing retry interval...`);
        clearInterval(retryIntervalRef.current);
      }

      // Only start retry if this is not a manual selection change
      if (!isManualSelectionRef.current) {
        // Only start retry if this is not a manual selection change
        // Only start retry if this is not a manual selection change
        console.log(
          `[AgentProvider] ⏰ Setting up retry interval (every 2s) for port ${port}...`,
        );
        retryIntervalRef.current = setInterval(() => {
          // Check if we should still retry (user hasn't manually selected another port)
          if (
            previouslySelectedPortRef.current === port &&
            !connected &&
            !isManualSelectionRef.current
          ) {
            console.log(
              `[AgentProvider] 🔄 Retrying connection to agent on port ${port}...`,
            );
            connectAgentInternal(port, false); // false = not manual selection
          } else {
            // Stop retrying if conditions are no longer met
            console.log(
              `[AgentProvider] 🛑 Stopping retry attempts for port ${port} (conditions no longer met)`,
            );
            if (retryIntervalRef.current) {
              clearInterval(retryIntervalRef.current);
              retryIntervalRef.current = undefined;
            }
          }
        }, 2000); // Retry every 2 seconds
      } else {
        console.log(
          `[AgentProvider] ⏭️ Skipping retry setup - this was a manual selection change`,
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
      console.log(`[AgentProvider] 🛑 Stopping retry connection attempts...`);
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
    console.log(
      `[AgentProvider] 🔍 Starting agent scan... (hasInitialScan: ${hasInitialScan}, connected: ${!!connected})`,
    );
    setIsRefreshing(true);
    try {
      const agents = await scanForAgents();

      // Log changes in available agents
      const previousCount = availableAgents.length;
      const newCount = agents.length;
      if (previousCount !== newCount) {
        console.log(
          `[AgentProvider] 📊 Available agents changed: ${previousCount} → ${newCount}`,
        );
      }

      setAvailableAgents(agents);

      // Auto-connect if exactly one agent is found and no agent is currently connected
      if (!hasInitialScan && agents.length === 1 && !connected) {
        // Auto-connect if exactly one agent is found and no agent is currently connected
        console.log(
          `[AgentProvider] 🤖 Auto-connecting to single available agent: ${agents[0].name} (port ${agents[0].port})`,
        );
        connectAgentInternal(agents[0].port, false); // false = not manual selection
      } else if (!hasInitialScan) {
        console.log(
          `[AgentProvider] 🤔 Not auto-connecting: ${agents.length} agents found, connected: ${!!connected}`,
        );
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
          console.log(
            `[AgentProvider] 🔄 Attempting to reconnect to previously selected agent: ${previousAgent.name} (port ${previousAgent.port})`,
          );
          connectAgentInternal(previousAgent.port, false); // false = not manual selection
        } else {
          console.log(
            `[AgentProvider] ❌ Previously selected agent (port ${previouslySelectedPortRef.current}) is no longer available`,
          );
        }
      }
    } catch (error) {
      console.error('[AgentProvider] ❌ Failed to scan for agents:', error);
    } finally {
      setIsRefreshing(false);
      setHasInitialScan(true);
      console.log(`[AgentProvider] ✅ Agent scan complete. Refreshing: false`);
    }
  }, [connected, hasInitialScan, availableAgents.length]);

  // ===== CONNECTION MANAGEMENT =====

  /**
   * Internal connection function that handles both manual and automatic connections.
   * Sets up health monitoring and retry logic based on connection type.
   */
  const connectAgentInternal = useCallback(
    (port: number, isManual = false) => {
      console.log(
        `[AgentProvider] 🔌 Attempting to connect to agent on port ${port} (manual: ${isManual})...`,
      );
      try {
        // Stop any ongoing retry attempts
        stopRetryConnection();

        // Clean up existing connection and health check
        if (connected) {
          console.log(
            `[AgentProvider] 🧹 Cleaning up existing connection (port ${connectedPort})...`,
          );
          setConnected(null);
          setConnectedPort(null);
        }
        if (connectionTimeoutRef.current) {
          console.log(
            `[AgentProvider] 🧹 Cleaning up existing health check...`,
          );
          connectionTimeoutRef.current();
        }

        const client = createWebSocketClient(port);
        setConnected(client);
        setConnectedPort(port);
        previouslySelectedPortRef.current = port;
        isManualSelectionRef.current = isManual;

        console.log(
          `[AgentProvider] ✅ Successfully connected to agent on port ${port}`,
        );

        // Set up connection health monitoring
        connectionTimeoutRef.current = setupConnectionHealthCheck(
          client,
          port,
          () => {
            // Connection lost callback
            console.log(
              `[AgentProvider] 💔 Connection lost to agent on port ${port}`,
            );
            setConnected(null);
            setConnectedPort(null);

            // Start retry attempts if this wasn't a manual disconnection
            if (
              previouslySelectedPortRef.current === port &&
              !isManualSelectionRef.current
            ) {
              // Start retry attempts if this wasn't a manual disconnection
              console.log(
                `[AgentProvider] 🔄 Starting retry attempts for port ${port}...`,
              );
              startRetryConnection(port);
            } else {
              console.log(
                `[AgentProvider] ⏭️ Not starting retry attempts (manual disconnection or different port selected)`,
              );
            }
          },
        );
      } catch (error) {
        console.error(
          `[AgentProvider] ❌ Failed to connect to agent on port ${port}:`,
          error,
        );
        setConnected(null);
        setConnectedPort(null);

        // Start retry attempts if this wasn't a manual selection and connection failed
        if (previouslySelectedPortRef.current === port && !isManual) {
          console.log(
            `[AgentProvider] 🔄 Failed to connect to agent on port ${port}, starting retry attempts...`,
          );
          startRetryConnection(port);
        }
      }
    },
    [connected, connectedPort, startRetryConnection, stopRetryConnection],
  );

  // ===== PUBLIC API FUNCTIONS =====

  /**
   * Disconnects from the currently connected agent and stops all retry attempts.
   */
  const disconnectAgent = useCallback(() => {
    console.log(
      `[AgentProvider] ✋ Manual disconnect requested (current port: ${connectedPort})...`,
    );
    // Stop any retry attempts
    stopRetryConnection();

    // Clean up connection health check
    if (connectionTimeoutRef.current) {
      console.log(`[AgentProvider] 🧹 Cleaning up connection health check...`);
      connectionTimeoutRef.current();
    }

    setConnected(null);
    setConnectedPort(null);
    previouslySelectedPortRef.current = null;
    isManualSelectionRef.current = true; // Mark as manual action
    console.log(`[AgentProvider] ✅ Successfully disconnected from agent`);
  }, [connectedPort, stopRetryConnection]);

  /**
   * Connects to an agent on the specified port (considered a manual user action).
   */
  const connectAgent = useCallback(
    (port: number) => {
      console.log(
        `[AgentProvider] 👤 Manual connection requested to port ${port}...`,
      );
      // Stop any ongoing retry attempts since this is a manual selection
      stopRetryConnection();
      // Reset manual selection flag after a brief moment to allow future automatic reconnections
      setTimeout(() => {
        console.log(
          `[AgentProvider] 🔄 Resetting manual selection flag to allow future auto-reconnects...`,
        );
        isManualSelectionRef.current = false;
      }, 100);
      connectAgentInternal(port, true); // true = manual selection
    },
    [connectAgentInternal, stopRetryConnection],
  );

  /**
   * Refreshes the list of available agents by rescanning ports.
   */
  const refreshAgentList = useCallback(() => {
    console.log(`[AgentProvider] 🔄 Manual refresh of agent list requested...`);
    scanAgents();
  }, [scanAgents]);

  // ===== LIFECYCLE EFFECTS =====

  // Log state changes
  useEffect(() => {
    console.log(
      `[AgentProvider] 📊 State change - Available agents: ${availableAgents.length}`,
      availableAgents.map((a) => `${a.name} (${a.port})`),
    );
  }, [availableAgents]);

  useEffect(() => {
    console.log(
      `[AgentProvider] 🔌 Connection state changed: ${connected ? `Connected to port ${connectedPort}` : 'Not connected'}`,
    );
  }, [connected, connectedPort]);

  useEffect(() => {
    console.log(`[AgentProvider] 🔄 Refreshing state changed: ${isRefreshing}`);
  }, [isRefreshing]);

  // Initial scan on mount
  useEffect(() => {
    console.log(
      '[AgentProvider] 🚀 Component mounted, starting initial agent scan...',
    );
    scanAgents();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[AgentProvider] 🧹 Component unmounting, cleaning up...');
      if (connectionTimeoutRef.current) {
        connectionTimeoutRef.current();
      }
      stopRetryConnection();
      console.log('[AgentProvider] ✅ Cleanup complete');
    };
  }, [stopRetryConnection]);

  // ===== PROVIDER INTERFACE =====

  /**
   * Memoized provider value to prevent unnecessary re-renders.
   */
  const providerInterface = useMemo(
    (): AgentProviderInterface => ({
      availableAgents,
      connected,
      connectAgent,
      disconnectAgent,
      refreshAgentList,
      isRefreshing,
      connectedPort,
    }),
    [
      availableAgents,
      connected,
      connectAgent,
      disconnectAgent,
      refreshAgentList,
      isRefreshing,
      connectedPort,
    ],
  );

  return (
    <agentContext.Provider value={providerInterface}>
      {children}
    </agentContext.Provider>
  );
}

export const useAgent = () => useContext(agentContext);
