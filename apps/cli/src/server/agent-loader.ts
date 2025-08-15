import { printInfoMessages } from '@/utils/print-info-messages.js';
import { log } from '../utils/logger.js';
import configResolver from '@/config/index.js';
import { Agent } from '@stagewise/agent-client';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import { analyticsEvents } from '@/utils/telemetry.js';
import { oauthManager } from '@/auth/oauth.js';

let agentInstance: Agent | null = null;

/**
 * Loads and initializes the agent server
 */
export async function loadAndInitializeAgent(
  accessToken: string,
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

    // Create agent instance
    agentInstance = Agent.getInstance({
      clientRuntime,
      accessToken,
      onEvent: async (event) => {
        printInfoMessages(event);
        switch (event.type) {
          case 'agent_prompt_triggered':
            analyticsEvents.sendPrompt();
            break;
          case 'auth_token_refresh_required':
            await oauthManager
              .ensureValidAccessToken()
              .then((token) => {
                agentInstance?.reauthenticateTRPCClient(token);
              })
              .catch((error) => {
                log.error(
                  `Error refreshing token: ${error instanceof Error ? error.message : 'Unknown error'}`,
                );
              });
            break;
          default:
            break;
        }
      },
    });

    // Initialize agent with Express integration
    // This will automatically set up the Karton endpoint
    const agentServer = await agentInstance.initialize();

    // Return the WebSocket server instance if available
    // The agent SDK may not return the WebSocket server in current versions
    return {
      success: true,
      wss: agentServer.wss,
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
      log.debug('Agent server shut down successfully');
    } catch (error) {
      log.error(
        `Error shutting down agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
  // Clear the instance reference
  agentInstance = null;
}

export function getAgentInstance(): any {
  return agentInstance;
}
