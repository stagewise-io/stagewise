import type { Config } from '../config/types.js';
import type { Plugin } from '../server/plugin-loader.js';
import { Agent, type AgentCallbacks } from '@stagewise/agent-client';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import { log } from '../utils/logger.js';
import { loadPlugins } from '../server/plugin-loader.js';
import { analyticsEvents } from '../utils/telemetry.js';
import { printInfoMessages } from '../utils/print-info-messages.js';

export interface WorkspaceInfo {
  path: string;
  config: Config;
  plugins: Plugin[];
  agent: Agent | null;
  initialized: boolean;
  startTime: Date;
}

export class Workspace {
  private config: Config;
  private plugins: Plugin[] = [];
  private agent: Agent | null = null;
  private clientRuntime: ClientRuntimeNode | null = null;
  private initialized = false;
  private startTime: Date;
  private path: string;
  private teardownCallbacks: Array<() => Promise<void>> = [];

  constructor(config: Config) {
    this.config = config;
    this.path = config.dir;
    this.startTime = new Date();
  }

  async initialize(
    accessToken: string,
    refreshToken: string,
    kartonCallbacks: AgentCallbacks,
  ): Promise<void> {
    try {
      log.info(`Initializing workspace at ${this.path}`);

      // Load plugins based on configuration
      this.plugins = await loadPlugins(this.config);

      const unavailablePlugins = this.plugins.filter(
        (p) => p.available === false,
      );
      if (unavailablePlugins.length > 0) {
        log.warn('The following plugins are not available:');
        unavailablePlugins.forEach((p) => {
          log.warn(`  - ${p.name}: ${p.error || 'Unknown error'}`);
        });
      }

      // Initialize agent if not in bridge mode
      if (!this.config.bridgeMode) {
        await this.initializeAgent(accessToken, refreshToken, kartonCallbacks);
      }

      this.initialized = true;
      log.info('Workspace initialized successfully');
    } catch (error) {
      log.error(
        `Failed to initialize workspace: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  private async initializeAgent(
    accessToken: string,
    refreshToken: string,
    kartonCallbacks: AgentCallbacks,
  ): Promise<void> {
    try {
      // Validate we have the required constructors
      if (!Agent || typeof Agent.getInstance !== 'function') {
        throw new Error('Agent class not found or invalid');
      }

      if (!ClientRuntimeNode || typeof ClientRuntimeNode !== 'function') {
        throw new Error('ClientRuntimeNode class not found or invalid');
      }

      // Create client runtime instance
      this.clientRuntime = new ClientRuntimeNode({
        workingDirectory: this.config.dir,
      });

      // Create agent instance with callbacks
      this.agent = Agent.getInstance({
        clientRuntime: this.clientRuntime,
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
            default:
              break;
          }
        },
        callbacks: kartonCallbacks,
      });

      // Initialize the agent
      await this.agent.initialize();

      log.info('Agent initialized successfully');
    } catch (error) {
      log.error(
        `Failed to initialize agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      if (error instanceof Error && error.stack) {
        log.debug(`Stack trace: ${error.stack}`);
      }
      throw error;
    }
  }

  async teardown(): Promise<void> {
    log.info(`Tearing down workspace at ${this.path}`);

    // Run all teardown callbacks
    for (const callback of this.teardownCallbacks) {
      try {
        await callback();
      } catch (error) {
        log.error(
          `Error in teardown callback: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    // Shutdown agent if it exists
    if (this.agent?.shutdown) {
      try {
        this.agent.shutdown();
        log.debug('Agent shut down successfully');
      } catch (error) {
        log.error(
          `Error shutting down agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    // Clear references
    this.agent = null;
    this.clientRuntime = null;
    this.plugins = [];
    this.initialized = false;

    log.info('Workspace teardown complete');
  }

  addTeardownCallback(callback: () => Promise<void>): void {
    this.teardownCallbacks.push(callback);
  }

  // Getters
  getConfig(): Config {
    return this.config;
  }

  getPlugins(): Plugin[] {
    return this.plugins;
  }

  getAvailablePlugins(): Plugin[] {
    return this.plugins.filter((p) => p.available !== false);
  }

  getUnavailablePlugins(): Plugin[] {
    return this.plugins.filter((p) => p.available === false);
  }

  getAgent(): Agent | null {
    return this.agent;
  }

  getPath(): string {
    return this.path;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getInfo(): WorkspaceInfo {
    return {
      path: this.path,
      config: this.config,
      plugins: this.plugins,
      agent: this.agent,
      initialized: this.initialized,
      startTime: this.startTime,
    };
  }

  // Get agent procedures for Karton
  getAgentProcedures(): any {
    if (!this.agent) {
      return {};
    }
    return this.agent.getAgentProcedures();
  }
}
