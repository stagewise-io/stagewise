import type { Application } from 'express';
import type { Server } from 'node:http';
import { printInfoMessages } from '@/utils/print-info-messages.js';
import { log } from '../utils/logger.js';
import configResolver from '@/config/index.js';
import { Agent } from '@stagewise/agent-client';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import { analyticsEvents } from '@/utils/telemetry.js';

let agentInstance: Agent | null = null;

/**
 * Loads and initializes the agent server
 */
export async function loadAndInitializeAgent(
  app: Application,
  server: Server,
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
      onEvent: (event) => {
        printInfoMessages(event);
        switch (event.type) {
          case 'agent_prompt_triggered':
            analyticsEvents.sendPrompt();
            break;
          default:
            break;
        }
      },
    });

    // Initialize agent with Express integration
    // This will automatically set up the Karton endpoint
    const agentServer = await agentInstance.initialize(
      app as any,
      server,
      '/stagewise-toolbar-app/karton',
    );

    log.debug('Agent endpoints available at /stagewise-toolbar-app/karton');

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
