import { DEFAULT_PORT } from '@stagewise/extension-toolbar-srpc-contract';
import { AnalyticsService, EventName } from 'src/services/analytics-service';
import * as vscode from 'vscode';
import { findAvailablePort } from 'src/utils/find-available-port';
import { startServer } from './http-server/server';
import { getExtensionBridge } from '@stagewise/extension-toolbar-srpc-contract';
import { getCurrentWindowInfo } from 'src/utils/window-discovery';
import { dispatchAgentCall } from 'src/utils/dispatch-agent-call';

// Right now, we're keeping this service in order keep compatibility with older versions of the toolbar
// TODO We should remove this module asap

export class RetroAgentService {
  private static instance: RetroAgentService;
  private analyticsService: AnalyticsService = AnalyticsService.getInstance();
  private server: Awaited<ReturnType<typeof startServer>> | null = null;
  private bridge: Awaited<ReturnType<typeof getExtensionBridge>> | null = null;

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  public shutdown() {
    this.server?.close();
    this.bridge?.close();
  }

  public static getInstance(): RetroAgentService {
    if (!RetroAgentService.instance) {
      RetroAgentService.instance = new RetroAgentService();
    }
    return RetroAgentService.instance;
  }

  public async initialize() {
    // Find an available port
    const port = await findAvailablePort(DEFAULT_PORT);

    // Start the HTTP server with the same port
    this.server = await startServer(port);
    this.bridge = getExtensionBridge(this.server);

    this.server.on('connect', () => {
      console.log('Toolbar connected');
      this.analyticsService.trackEvent(EventName.TOOLBAR_CONNECTED);
    });

    this.bridge.register({
      getSessionInfo: async (_request, _sendUpdate) => {
        return getCurrentWindowInfo(port);
      },
      triggerAgentPrompt: async (request, sendUpdate) => {
        // If sessionId is provided, validate it matches this window
        // If no sessionId provided, accept the request (backward compatibility)
        if (request.sessionId && request.sessionId !== vscode.env.sessionId) {
          const error = `Session mismatch: Request for ${request.sessionId} but this window is ${vscode.env.sessionId}`;
          console.warn(`[Stagewise] ${error}`);
          return {
            sessionId: vscode.env.sessionId,
            result: {
              success: false,
              error: error,
              errorCode: 'session_mismatch',
            },
          };
        }
        this.analyticsService.trackEvent(EventName.AGENT_PROMPT_TRIGGERED);

        await dispatchAgentCall(request);
        sendUpdate.sendUpdate({
          sessionId: vscode.env.sessionId,
          updateText: 'Called the agent',
        });

        return {
          sessionId: vscode.env.sessionId,
          result: { success: true },
        };
      },
    });
  }
}
