import * as vscode from 'vscode';
import { Agent as StagewiseAgentService } from '@stagewise/agent-client';
import { setupToolbar } from '../auto-prompts/setup-toolbar';
import { getCurrentIDE } from 'src/utils/get-current-ide';
import { AnalyticsService, EventName } from 'src/services/analytics-service';
import {
  createGettingStartedPanel,
  shouldShowGettingStarted,
} from '../webviews/getting-started';
import { StorageService } from 'src/services/storage-service';
import { VScodeContext } from 'src/services/vscode-context';
import { EnvironmentInfo } from 'src/services/environment-info';
import { ToolbarUpdateNotificator } from 'src/services/toolbar-update-notificator';
import { ToolbarIntegrationNotificator } from 'src/services/toolbar-integration-notificator';
import { WorkspaceService } from 'src/services/workspace-service';
import { RegistryService } from 'src/services/registry-service';
import { AuthService } from 'src/services/auth-service';
import { AgentService as IDEChatAgentService } from 'src/services/agent-service';
import { RetroAgentService } from 'src/services/agent-service/retro';
import { ClientRuntimeVSCode } from '@stagewise/agent-runtime-vscode';
import { AgentSelectorService } from 'src/services/agent-selector';

let stagewiseAgentInitialized = false;
let ideAgentInitialized = false;

let stagewiseAgentServiceInstance: StagewiseAgentService | null = null;

// Diagnostic collection specifically for our fake prompt
const fakeDiagCollection =
  vscode.languages.createDiagnosticCollection('stagewise');

// Create output channel for stagewise
const outputChannel = vscode.window.createOutputChannel('stagewise');

// Handler for the setupToolbar command
async function setupToolbarHandler() {
  await setupToolbar();
  await vscode.window.showInformationMessage(
    "The agent has been started to integrate stagewise into this project. Please follow the agent's instructions in the chat panel.",
    'OK',
  );
}

// Helper functions for agent management
async function initializeIDEAgent() {
  if (ideAgentInitialized) {
    return; // Already initialized
  }
  const ideAgentService = IDEChatAgentService.getInstance();
  await ideAgentService.initialize();
  AgentSelectorService.getInstance().updateStatusbarText('Forward to IDE Chat');
  ideAgentInitialized = true;
}

async function shutdownIDEAgent() {
  if (!ideAgentInitialized) {
    return; // Not initialized
  }
  const ideAgentService = IDEChatAgentService.getInstance();
  await ideAgentService.shutdown();
  ideAgentInitialized = false;
}

async function initializeStagewiseAgent(
  stagewiseAgentService: StagewiseAgentService,
) {
  if (stagewiseAgentInitialized) {
    return; // Already initialized
  }
  try {
    await stagewiseAgentService.initialize();
    stagewiseAgentInitialized = true;
    AgentSelectorService.getInstance().updateStatusbarText('stagewise Agent');
  } catch (error) {
    console.error(
      'Failed to initialize stagewise agent:',
      error instanceof Error ? error.message : String(error),
    );
    stagewiseAgentInitialized = false;
    throw error; // Re-throw to handle fallback
  }
}

async function shutdownStagewiseAgent() {
  if (!stagewiseAgentInitialized) {
    return; // Not initialized
  }
  stagewiseAgentServiceInstance?.shutdown();
  stagewiseAgentInitialized = false;
}

export async function activate(context: vscode.ExtensionContext) {
  try {
    // Initialize all services in the correct order
    VScodeContext.getInstance().initialize(context);
    await StorageService.getInstance().initialize();

    const analyticsService = AnalyticsService.getInstance();
    await analyticsService.initialize();

    WorkspaceService.getInstance();
    RegistryService.getInstance();
    await EnvironmentInfo.getInstance().initialize();

    const integrationNotificator = ToolbarIntegrationNotificator.getInstance();
    integrationNotificator.initialize();
    context.subscriptions.push(integrationNotificator);

    const updateNotificator = ToolbarUpdateNotificator.getInstance();
    updateNotificator.initialize();
    context.subscriptions.push(updateNotificator);

    const agentSelectorService = AgentSelectorService.getInstance();
    await agentSelectorService.initialize();

    // Initialize AuthService
    const authService = AuthService.getInstance();

    stagewiseAgentServiceInstance = StagewiseAgentService.getInstance({
      clientRuntime: new ClientRuntimeVSCode(),
      accessToken: (await authService.getAccessToken()) ?? undefined,
      agentDescription: vscode.workspace.name,
      // New events to track in analytics
      onEvent: (event) => {
        switch (event.type) {
          case 'agent_prompt_triggered': {
            analyticsService.trackEvent(
              EventName.STAGEWISE_AGENT_PROMPT_TRIGGERED,
              {
                agentType: 'stagewise',
                hasUserMessage: event.data.hasUserMessage,
                messageId: event.data.messageId,
                currentUrl: event.data.currentUrl,
                selectedElementsCount: event.data.selectedElementsCount,
                promptSnippetsCount: event.data.promptSnippetsCount,
              },
            );
            break;
          }
          case 'tool_call_requested': {
            analyticsService.trackEvent(
              EventName.STAGEWISE_AGENT_TOOL_CALL_REQUESTED,
              {
                agentType: 'stagewise',
                toolName: event.data.toolName,
                isClientSide: event.data.isClientSide,
                isBrowserRuntime: event.data.isBrowserRuntime,
              },
            );
            break;
          }
          case 'auth_token_refresh_required': {
            // Handle auth token refresh request
            console.log(
              '[stagewise] Auth token refresh requested:',
              event.data,
            );

            // Handle async operation
            (async () => {
              try {
                // Get fresh access token
                const accessToken = await authService.ensureValidAccessToken();

                if (accessToken) {
                  // Update the agent with new token
                  stagewiseAgentServiceInstance?.reauthenticateTRPCClient(
                    accessToken,
                  );
                  console.log(
                    '[stagewise] Successfully refreshed auth token for agent',
                  );
                } else {
                  console.error('[stagewise] Failed to get valid access token');
                }
              } catch (error) {
                console.error(
                  '[stagewise] Error refreshing auth token:',
                  error,
                );

                // Track the error
                analyticsService.trackEvent(
                  EventName.STAGEWISE_AGENT_AUTH_REFRESH_FAILED,
                  {
                    reason: event.data.reason,
                    retryAttempt: event.data.retryAttempt,
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
                );
              }
            })();
            break;
          }
          default:
            break;
        }
      },
    });

    // Set up auth state change handler
    authService.onAuthStateChanged(async (authState) => {
      // Update access token for stagewise agent if available
      if (authState.accessToken) {
        stagewiseAgentServiceInstance?.reauthenticateTRPCClient(
          authState.accessToken,
        );
      }

      if (authState.userId) {
        await analyticsService.identify(authState.userId, authState.userEmail);
      }

      // Handle stagewise agent based on auth state (IDE agent always runs)
      if (authState.isAuthenticated) {
        // User is authenticated - initialize stagewise agent
        if (
          stagewiseAgentServiceInstance &&
          !stagewiseAgentInitialized &&
          agentSelectorService.getPreferredAgent() === 'stagewise-agent'
        ) {
          try {
            await shutdownIDEAgent();
            await initializeStagewiseAgent(stagewiseAgentServiceInstance);
          } catch (error) {
            console.error(
              'Failed to initialize stagewise agent on auth state change:',
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      } else if (
        stagewiseAgentInitialized &&
        agentSelectorService.getPreferredAgent() !== 'stagewise-agent'
      ) {
        await shutdownStagewiseAgent();
        await initializeIDEAgent();
      }
    });

    // Initial agent setup - IDE agent always runs
    if (agentSelectorService.getPreferredAgent() === 'ide-chat') {
      await initializeIDEAgent();
    }

    agentSelectorService.onPreferredAgentChanged(async (agentName) => {
      if (agentName === 'stagewise-agent' && stagewiseAgentServiceInstance) {
        await shutdownIDEAgent();
        await shutdownStagewiseAgent();
        await initializeStagewiseAgent(stagewiseAgentServiceInstance);
      } else {
        await shutdownIDEAgent();
        await shutdownStagewiseAgent();
        await initializeIDEAgent();
      }
    });

    // Initialize stagewise agent if authenticated
    const authState = await authService.getAuthState();

    if (authState?.isAuthenticated && authState.userId) {
      await analyticsService.identify(authState.userId, authState.userEmail);
    }

    if (
      authState?.isAuthenticated &&
      authState?.accessToken &&
      agentSelectorService.getPreferredAgent() === 'stagewise-agent'
    ) {
      // User is authenticated - initialize stagewise agent
      try {
        await initializeStagewiseAgent(stagewiseAgentServiceInstance);
      } catch (error) {
        // Log error but continue with IDE agent only
        console.error(
          'Initial stagewise agent initialization failed:',
          error instanceof Error ? error.message : String(error),
        );
      }
    } else {
      await initializeIDEAgent();
    }

    const uriHandler = vscode.window.registerUriHandler({
      handleUri: async (uri: vscode.Uri) => {
        if (uri.path === '/authenticate') {
          await authService.handleAuthenticationUri(uri);
          await agentSelectorService.setPreferredAgent('stagewise-agent');
        }
      },
    });
    context.subscriptions.push(uriHandler);

    // Always initialize RetroAgent
    const retroAgentService = RetroAgentService.getInstance();
    await retroAgentService.initialize();

    const ide = getCurrentIDE();
    if (ide === 'UNKNOWN') {
      vscode.window.showInformationMessage(
        'stagewise does not work for your current IDE.',
      );
      return;
    }
    context.subscriptions.push(fakeDiagCollection); // Dispose on deactivation
    context.subscriptions.push(outputChannel); // Dispose output channel on deactivation

    const storage = StorageService.getInstance();

    // Add configuration change listener to track telemetry setting changes
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(
      async (e) => {
        if (e.affectsConfiguration('stagewise.telemetry.enabled')) {
          const config = vscode.workspace.getConfiguration('stagewise');
          const telemetryEnabled = config.get<boolean>(
            'telemetry.enabled',
            true,
          );

          // Track the telemetry state change using the dedicated function
          analyticsService.trackTelemetryStateChange(telemetryEnabled);
        }
      },
    );

    context.subscriptions.push(configChangeListener);

    // Function to show getting started panel if needed
    const showGettingStartedIfNeeded = async () => {
      if (await shouldShowGettingStarted(storage)) {
        analyticsService.trackEvent(EventName.GETTING_STARTED_PANEL_SHOWN);
        createGettingStartedPanel(context, storage, setupToolbarHandler);
      }
    };

    if (vscode.workspace.workspaceFolders?.length) {
      // Show getting started panel on workspace load (activation)
      await showGettingStartedIfNeeded();
    }

    // Listen for workspace folder changes (workspace loaded)
    const workspaceFolderListener =
      vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        if (vscode.workspace.workspaceFolders?.length) {
          await showGettingStartedIfNeeded();
        }
      });
    context.subscriptions.push(workspaceFolderListener);

    // Register the setupToolbar command
    const setupToolbarCommand = vscode.commands.registerCommand(
      'stagewise.setupToolbar',
      async () => {
        try {
          analyticsService.trackEvent(EventName.TOOLBAR_AUTO_SETUP_STARTED);
          await setupToolbarHandler();
        } catch (error) {
          console.error(
            'Error during toolbar setup:',
            error instanceof Error ? error.message : String(error),
          );
          throw error;
        }
      },
    );
    context.subscriptions.push(setupToolbarCommand);

    const setAgentCommand = vscode.commands.registerCommand(
      'stagewise.setAgent',
      async () => {
        await agentSelectorService.showAgentPicker();
      },
    );
    context.subscriptions.push(setAgentCommand);

    // Register the show getting started command
    const showGettingStartedCommand = vscode.commands.registerCommand(
      'stagewise.showGettingStarted',
      async () => {
        try {
          analyticsService.trackEvent(
            EventName.GETTING_STARTED_PANEL_MANUAL_SHOW,
          );
          createGettingStartedPanel(context, storage, setupToolbarHandler);
        } catch (error) {
          console.error(
            'Error showing getting started panel:',
            error instanceof Error ? error.message : String(error),
          );
          throw error;
        }
      },
    );
    context.subscriptions.push(showGettingStartedCommand);

    // Register authentication commands
    const authenticateCommand = vscode.commands.registerCommand(
      'stagewise.authenticate',
      async () => {
        try {
          analyticsService.trackEvent(EventName.AUTHENTICATE_COMMAND_TRIGGERED);
          await authService.authenticate();
        } catch (error) {
          console.error(
            'Error during authentication:',
            error instanceof Error ? error.message : String(error),
          );
          vscode.window.showErrorMessage(
            `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
          );
        }
      },
    );
    context.subscriptions.push(authenticateCommand);

    const logoutCommand = vscode.commands.registerCommand(
      'stagewise.logout',
      async () => {
        try {
          analyticsService.trackEvent(EventName.LOGOUT_COMMAND_TRIGGERED);
          await authService.logout();
        } catch (error) {
          console.error(
            'Error during logout:',
            error instanceof Error ? error.message : String(error),
          );
          vscode.window.showErrorMessage(
            `Logout failed: ${error instanceof Error ? error.message : 'Please try again.'}`,
          );
        }
      },
    );
    context.subscriptions.push(logoutCommand);

    const checkAuthStatusCommand = vscode.commands.registerCommand(
      'stagewise.checkAuthStatus',
      async () => {
        try {
          analyticsService.trackEvent(
            EventName.CHECK_AUTH_STATUS_COMMAND_TRIGGERED,
          );
          await authService.checkAuthStatus();
        } catch (error) {
          console.error(
            'Error checking auth status:',
            error instanceof Error ? error.message : String(error),
          );
          vscode.window.showErrorMessage(
            `Failed to check authentication status: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    );
    context.subscriptions.push(checkAuthStatusCommand);
  } catch (error) {
    console.error('Error during extension activation:', error);
  }
}

export async function deactivate(_context: vscode.ExtensionContext) {
  try {
    AnalyticsService.getInstance().shutdown();

    // Shutdown stagewise agent if initialized
    if (stagewiseAgentInitialized) {
      await shutdownStagewiseAgent();
    }

    // Shutdown IDE agent if initialized
    if (ideAgentInitialized) {
      await shutdownIDEAgent();
    }

    // Always shutdown RetroAgent
    const retroAgentService = RetroAgentService.getInstance();
    await retroAgentService.shutdown();
  } catch (error) {
    // Log error but don't throw during deactivation
    console.error(
      'Error during extension deactivation:',
      error instanceof Error ? error.message : String(error),
    );
  }
}
