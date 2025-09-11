import { printInfoMessages } from '@/utils/print-info-messages.js';
import { log } from '../utils/logger.js';
import configResolver from '@/config/index.js';
import { Agent, type AgentCallbacks } from '@stagewise/agent-client';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import { analyticsEvents } from '@/utils/telemetry.js';
import {
  createKartonServer,
  type KartonServer,
} from '@stagewise/karton/server';
import type { KartonContract } from '@stagewise/karton-contract';

let agentInstance: Agent | null = null;
let kartonServer: KartonServer<KartonContract> | null = null;

/**
 * Loads and initializes the agent server
 */
export async function loadAndInitializeAgent(
  accessToken: string,
  refreshToken: string,
): Promise<{ success: boolean; wss?: any }> {
  try {
    // Validate we have the required constructors
    if (!Agent || typeof Agent.getInstance !== 'function') {
      throw new Error('Agent class not found or invalid');
    }

    if (!ClientRuntimeNode || typeof ClientRuntimeNode !== 'function') {
      throw new Error('ClientRuntimeNode class not found or invalid');
    }

    const config = configResolver.getConfig();

    // Create client runtime instance
    const clientRuntime = new ClientRuntimeNode({
      workingDirectory: config.dir,
    });

    // Create a placeholder for the karton server
    let tempKartonServer: KartonServer<KartonContract> | null = null;

    // Create callbacks that will use the karton server (will be set later)
    const callbacks: AgentCallbacks = {
      getState: () => {
        if (!tempKartonServer) throw new Error('Karton server not initialized');
        return tempKartonServer.state;
      },
      setState: (recipe) => {
        if (!tempKartonServer) throw new Error('Karton server not initialized');
        // @ts-ignore we'll fix this whole temp instantiation shit later
        return tempKartonServer.setState(recipe);
      },
    };

    // Create agent instance with callbacks
    agentInstance = Agent.getInstance({
      clientRuntime,
      accessToken,
      refreshToken,
      onEvent: async (event) => {
        printInfoMessages(event);
        switch (event.type) {
          case 'agent_prompt_triggered':
            analyticsEvents.sendPrompt();
            break;
          case 'credits_insufficient':
            analyticsEvents.creditsInsufficient({
              status: event.data.subscription?.subscription?.status || '',
              credits: event.data.subscription?.credits?.total || 0,
              credits_used: event.data.subscription?.credits?.used || 0,
              credits_remaining:
                event.data.subscription?.credits?.available || 0,
            });
            break;
          case 'plan_limits_exceeded':
            analyticsEvents.planLimitsExceeded({
              status: event.data.subscription?.subscription?.status || '',
            });
            break;
          default:
            break;
        }
      },
      callbacks,
    });

    // Now create the karton server with agent procedures
    kartonServer = await createKartonServer<KartonContract>({
      procedures: agentInstance.getAgentProcedures() as any,
      initialState: {
        workspaceInfo: {
          path: clientRuntime.fileSystem.getCurrentWorkingDirectory(),
          devAppPort: 0,
          loadedPlugins: [],
        },
        activeChatId: null,
        chats: {},
        isWorking: false,
        toolCallApprovalRequests: [],
        subscription: undefined,
      },
    });

    // Set the karton server reference in callbacks
    tempKartonServer = kartonServer;

    // Initialize the agent
    await agentInstance.initialize();

    // Return the WebSocket server instance from karton server
    return {
      success: true,
      wss: kartonServer.wss,
    };
  } catch (error) {
    log.error(
      `Failed to initialize agent server: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    if (error instanceof Error && error.stack) {
      log.debug(`Stack trace: ${error.stack}`);
    }
    return { success: false };
  }
}

export function shutdownAgent(): void {
  if (agentInstance?.shutdown) {
    try {
      agentInstance.shutdown();
      log.debug('Agent shut down successfully');
    } catch (error) {
      log.error(
        `Error shutting down agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  if (kartonServer) {
    try {
      // Close WebSocket server
      if (kartonServer.wss) {
        kartonServer.wss.close();
      }
      log.debug('Karton server shut down successfully');
    } catch (error) {
      log.error(
        `Error shutting down karton server: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // Clear the instance references
  agentInstance = null;
  kartonServer = null;
}

export function getAgentInstance(): any {
  return agentInstance;
}
