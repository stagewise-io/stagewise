import { Workspace } from './workspace.js';
import type { Config } from '../config/types.js';
import { log } from '../utils/logger.js';
import configResolver from '../config/index.js';
import type { AgentCallbacks } from '@stagewise/agent-client';
import { EventEmitter } from 'node:events';

export class WorkspaceManager extends EventEmitter {
  private currentWorkspace: Workspace | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private kartonCallbacks: AgentCallbacks | null = null;
  private static instance: WorkspaceManager | null = null;

  private constructor() {
    super();
  }

  static getInstance(): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      WorkspaceManager.instance = new WorkspaceManager();
    }
    return WorkspaceManager.instance;
  }

  setAuthTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  setKartonCallbacks(callbacks: AgentCallbacks): void {
    this.kartonCallbacks = callbacks;
  }

  async switchWorkspace(workspacePath: string): Promise<Workspace> {
    log.info(`Switching workspace to: ${workspacePath}`);

    // Teardown current workspace if it exists
    if (this.currentWorkspace) {
      await this.teardownCurrentWorkspace();
    }

    // Create new config for the new workspace
    const newConfig = await configResolver.resolveConfig({
      dir: workspacePath,
    });

    // Create and initialize new workspace
    const newWorkspace = new Workspace(newConfig);

    if (this.accessToken && this.refreshToken && this.kartonCallbacks) {
      await newWorkspace.initialize(
        this.accessToken,
        this.refreshToken,
        this.kartonCallbacks,
      );
    }

    this.currentWorkspace = newWorkspace;

    // Emit workspace changed event
    this.emit('workspaceChanged', newWorkspace);

    log.info(`Workspace switched successfully to: ${workspacePath}`);
    return newWorkspace;
  }

  async initializeWorkspace(config: Config): Promise<Workspace> {
    if (this.currentWorkspace) {
      log.warn('Workspace already initialized, tearing down first');
      await this.teardownCurrentWorkspace();
    }

    const workspace = new Workspace(config);

    if (this.accessToken && this.refreshToken && this.kartonCallbacks) {
      await workspace.initialize(
        this.accessToken,
        this.refreshToken,
        this.kartonCallbacks,
      );
    }

    this.currentWorkspace = workspace;

    // Emit workspace initialized event
    this.emit('workspaceInitialized', workspace);

    return workspace;
  }

  private async teardownCurrentWorkspace(): Promise<void> {
    if (!this.currentWorkspace) {
      return;
    }

    log.info('Tearing down current workspace');

    // Emit workspace teardown event
    this.emit('workspaceTeardown', this.currentWorkspace);

    await this.currentWorkspace.teardown();
    this.currentWorkspace = null;
  }

  get workspace(): Workspace | null {
    return this.currentWorkspace;
  }

  async shutdown(): Promise<void> {
    await this.teardownCurrentWorkspace();
    this.removeAllListeners();
  }
}
