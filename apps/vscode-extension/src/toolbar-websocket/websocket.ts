import { type WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import {
  type WebSocketMessage,
  WebSocketConnectionManager,
  type ExtensionToToolbarMessage,
  type ToolbarToExtensionMessage,
  type ToolUsageRequest,
  type PromptTriggerResponse,
  type ToolUsageResponse,
} from '@stagewise/extension-websocket-contract';
import { randomUUID } from 'node:crypto';
import { callCursorAgent } from '../utils/call-cursor-agent';

/**
 * Server-side WebSocket implementation that extends the base WebSocketConnectionManager.
 * This class provides specific functionality for server-side WebSocket communication
 * with the toolbar, including:
 * - WebSocket server management
 * - Connection handling
 * - Message routing between toolbar and extension
 */
export class WebSocketManager extends WebSocketConnectionManager {
  private wss: WebSocketServer;

  /**
   * Creates a new WebSocketManager instance
   * @param server The HTTP server to attach the WebSocket server to
   */
  constructor(server: Server) {
    super();
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      // If there's an existing connection, close it first
      if (this.ws) {
        console.warn(
          'New WebSocket connection attempted while one is already active. Closing existing connection first.',
        );
        const oldWs = this.ws;
        this.ws = null;
        oldWs.close();
      }

      this.ws = ws;
      this.setupWebSocketHandlers(ws);

      // Add cleanup handler when connection closes
      ws.on('close', () => {
        if (this.ws === ws) {
          this.ws = null;
        }
      });
    });
  }

  /**
   * Handles incoming requests from the toolbar
   * @param message The request message to handle
   */
  protected async handleRequest(message: WebSocketMessage) {
    if (this.isToolbarToExtensionMessage(message)) {
      this.handleToolbarRequest(message);
    } else {
      this.handleExtensionRequest(message);
    }
  }

  /**
   * Handles requests received from the toolbar
   * @param message The toolbar request to handle
   */
  private async handleToolbarRequest(message: ToolbarToExtensionMessage) {
    switch (message.type) {
      case 'prompt_trigger_request': {
        await callCursorAgent(message.payload.prompt);
        // Handle prompt trigger request from toolbar
        // Send response back to toolbar
        const response: PromptTriggerResponse = {
          type: 'prompt_trigger_response',
          messageType: 'response',
          id: message.id,
          payload: {
            status: 'success',
            progressText: 'Prompt processed successfully',
          },
        };
        if (this.ws) {
          this.ws.send(JSON.stringify(response));
        }
        break;
      }
      case 'tool_usage_response': {
        // This should never happen as tool_usage_response is a response type
        break;
      }
    }
  }

  /**
   * Handles requests received from the extension
   * @param message The extension request to handle
   */
  private handleExtensionRequest(message: ExtensionToToolbarMessage) {
    switch (message.type) {
      case 'tool_usage_request': {
        // Handle tool usage request to toolbar
        // Send response back to extension
        const response: ToolUsageResponse = {
          type: 'tool_usage_response',
          messageType: 'response',
          id: message.id,
          payload: {
            toolName: message.payload.toolName,
            toolOutput: null, // This should be filled with actual tool output
          },
        };
        if (this.ws) {
          this.ws.send(JSON.stringify(response));
        }
        break;
      }
      case 'prompt_trigger_response': {
        // This should never happen as prompt_trigger_response is a response type
        console.error('Received prompt_trigger_response as a request');
        break;
      }
    }
  }

  /**
   * Type guard to check if a message is from the toolbar
   * @param message The message to check
   * @returns true if the message is from the toolbar
   */
  private isToolbarToExtensionMessage(
    message: WebSocketMessage,
  ): message is ToolbarToExtensionMessage {
    return (
      message.type === 'prompt_trigger_request' ||
      message.type === 'tool_usage_response'
    );
  }

  /**
   * Sends a tool usage request to the toolbar
   * @param toolName The name of the tool to use
   * @param toolInput The input parameters for the tool
   * @returns Promise that resolves with the tool's output
   */
  public sendToolUsageRequest<T>(toolName: string, toolInput: T): Promise<any> {
    const message: ToolUsageRequest<T> = {
      type: 'tool_usage_request',
      messageType: 'request',
      id: randomUUID(),
      payload: {
        toolName,
        toolInput,
      },
    };
    return this.sendRequest(message);
  }

  /**
   * Sends a prompt trigger response to the toolbar
   * @param status The status of the prompt trigger
   * @param progressText Optional progress text to include
   */
  public sendPromptTriggerResponse(
    status: 'pending' | 'success' | 'error',
    progressText?: string,
  ) {
    const message: PromptTriggerResponse = {
      type: 'prompt_trigger_response',
      messageType: 'response',
      id: randomUUID(),
      payload: {
        status,
        progressText,
      },
    };
    if (this.ws) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Throws an error as server-side WebSocket manager does not support reconnection
   */
  protected reconnect() {
    // Server doesn't need to reconnect
    throw new Error('Server WebSocket manager does not support reconnection');
  }

  /**
   * Closes the WebSocket server and all connections
   */
  public close() {
    super.close();
    this.wss.close();
  }
}
