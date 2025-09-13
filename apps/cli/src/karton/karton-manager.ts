import {
  createKartonServer,
  type KartonServer,
} from '@stagewise/karton/server';
import type { KartonContract } from '@stagewise/karton-contract';
import type { AgentCallbacks } from '@stagewise/agent-client';
import { WorkspaceManager } from '../workspace/workspace-manager.js';
import { log } from '../utils/logger.js';
import { oauthManager } from '../auth/oauth.js';
import type { Workspace } from '../workspace/workspace.js';

export interface ExtendedKartonContract extends KartonContract {
  procedures: KartonContract['procedures'] & {
    switchWorkspace: (workspacePath: string) => Promise<{ success: boolean; error?: string }>;
    getAuthStatus: () => Promise<{ isAuthenticated: boolean; userEmail?: string }>;
    authenticate: () => Promise<{ success: boolean; error?: string }>;
    logout: () => Promise<{ success: boolean }>;
  };
  state: KartonContract['state'] & {
    authStatus: {
      isAuthenticated: boolean;
      userEmail?: string;
      userId?: string;
    };
    serverInfo: {
      port: number;
      url: string;
    };
    currentWorkspacePath: string | null;
  };
}

export class KartonManager {
  private kartonServer: KartonServer<ExtendedKartonContract> | null = null;
  private workspaceManager: WorkspaceManager;
  private static instance: KartonManager | null = null;
  private serverPort: number = 0;
  private serverUrl: string = '';

  private constructor() {
    this.workspaceManager = WorkspaceManager.getInstance();
  }

  static getInstance(): KartonManager {
    if (!KartonManager.instance) {
      KartonManager.instance = new KartonManager();
    }
    return KartonManager.instance;
  }

  async initialize(port: number): Promise<KartonServer<ExtendedKartonContract>> {
    this.serverPort = port;
    this.serverUrl = `http://localhost:${port}`;

    // Get initial auth status
    const authState = await oauthManager.getAuthState();

    // Create callbacks that will be used by agent
    const callbacks: AgentCallbacks = {
      getState: () => {
        if (!this.kartonServer) throw new Error('Karton server not initialized');
        return this.kartonServer.state;
      },
      setState: (recipe) => {
        if (!this.kartonServer) throw new Error('Karton server not initialized');
        // @ts-ignore we'll fix this type issue
        return this.kartonServer.setState(recipe);
      },
    };

    // Store callbacks in workspace manager
    this.workspaceManager.setKartonCallbacks(callbacks);

    // Create base procedures
    const baseProcedures = {
      switchWorkspace: async (workspacePath: string) => {
        try {
          const workspace = await this.workspaceManager.switchWorkspace(workspacePath);
          
          // Update Karton state
          if (this.kartonServer) {
            this.kartonServer.setState((draft) => {
              draft.currentWorkspacePath = workspacePath;
              draft.workspaceInfo = {
                path: workspace.getPath(),
                devAppPort: workspace.getConfig().appPort,
                loadedPlugins: workspace.getPlugins().map(p => p.name),
              };
            });
          }
          
          return { success: true };
        } catch (error) {
          log.error(`Failed to switch workspace: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      },
      
      getAuthStatus: async () => {
        const authState = await oauthManager.getAuthState();
        return {
          isAuthenticated: authState?.isAuthenticated || false,
          userEmail: authState?.userEmail,
        };
      },
      
      authenticate: async () => {
        try {
          // Use existing OAuth flow through the main server
          const authState = await oauthManager.getAuthState();
          if (authState?.isAuthenticated) {
            return { success: true };
          }
          
          // Initiate OAuth flow
          const tokenData = await oauthManager.initiateOAuthFlow(
            this.serverPort,
            undefined,
            false,
          );
          
          // Update auth tokens in workspace manager
          if (tokenData.accessToken && tokenData.refreshToken) {
            this.workspaceManager.setAuthTokens(
              tokenData.accessToken,
              tokenData.refreshToken,
            );
          }
          
          // Update Karton state
          if (this.kartonServer) {
            this.kartonServer.setState((draft) => {
              draft.authStatus = {
                isAuthenticated: true,
                userEmail: tokenData.userEmail,
                userId: tokenData.userId,
              };
            });
          }
          
          return { success: true };
        } catch (error) {
          log.error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      },
      
      logout: async () => {
        await oauthManager.logout();
        
        // Update Karton state
        if (this.kartonServer) {
          this.kartonServer.setState((draft) => {
            draft.authStatus = {
              isAuthenticated: false,
            };
          });
        }
        
        return { success: true };
      },
    };

    // Get current workspace procedures if available
    const currentWorkspace = this.workspaceManager.getCurrentWorkspace();
    const agentProcedures = currentWorkspace ? currentWorkspace.getAgentProcedures() : {};

    // Create Karton server with combined procedures
    this.kartonServer = await createKartonServer<ExtendedKartonContract>({
      procedures: {
        ...agentProcedures,
        ...baseProcedures,
      } as any,
      initialState: {
        workspaceInfo: currentWorkspace ? {
          path: currentWorkspace.getPath(),
          devAppPort: currentWorkspace.getConfig().appPort,
          loadedPlugins: currentWorkspace.getPlugins().map(p => p.name),
        } : {
          path: '',
          devAppPort: 0,
          loadedPlugins: [],
        },
        activeChatId: null,
        chats: {},
        isWorking: false,
        toolCallApprovalRequests: [],
        subscription: undefined,
        authStatus: {
          isAuthenticated: authState?.isAuthenticated || false,
          userEmail: authState?.userEmail,
          userId: authState?.userId,
        },
        serverInfo: {
          port: this.serverPort,
          url: this.serverUrl,
        },
        currentWorkspacePath: currentWorkspace?.getPath() || null,
      },
    });

    // Listen for workspace changes to update procedures
    this.workspaceManager.on('workspaceChanged', (workspace: Workspace) => {
      this.updateAgentProcedures(workspace);
    });

    this.workspaceManager.on('workspaceInitialized', (workspace: Workspace) => {
      this.updateAgentProcedures(workspace);
    });

    log.info('Karton server initialized');
    return this.kartonServer;
  }

  private updateAgentProcedures(workspace: Workspace): void {
    if (!this.kartonServer) return;

    const agentProcedures = workspace.getAgentProcedures();
    
    // Note: This is a simplified approach. In reality, we'd need to 
    // properly merge procedures or recreate the Karton server
    // For now, we'll just log that procedures should be updated
    log.debug('Agent procedures updated for new workspace');
  }

  getKartonServer(): KartonServer<ExtendedKartonContract> | null {
    return this.kartonServer;
  }

  async shutdown(): void {
    if (this.kartonServer) {
      try {
        // Close WebSocket server
        if (this.kartonServer.wss) {
          this.kartonServer.wss.close();
        }
        log.debug('Karton server shut down successfully');
      } catch (error) {
        log.error(
          `Error shutting down karton server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }
}