import { type WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import {
  type WebSocketMessage,
  WebSocketConnectionManager,
  type ExtensionToToolbarMessage,
  type ToolbarToExtensionMessage,
  type ToolUsageRequest,
  type PromptTriggerResponse,
} from '@stagewise/extension-websocket-contract';
import { randomUUID } from 'node:crypto';

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
   * Handles incoming WebSocket messages by routing them to appropriate handlers
   * @param message The received WebSocket message
   */
  protected handleMessage(message: WebSocketMessage) {
    console.log('THIS IS A MESSAGE', message);
    if (this.isToolbarToExtensionMessage(message)) {
      this.handleToolbarMessage(message);
    } else {
      this.handleExtensionMessage(message);
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
   * Handles messages received from the toolbar
   * @param message The toolbar message to handle
   */
  private async handleToolbarMessage(message: ToolbarToExtensionMessage) {
    switch (message.type) {
      case 'prompt_trigger_request':
        // Handle prompt trigger request from toolbar
        console.log(
          `Received prompt trigger request: ${message.payload.prompt}`,
        );
        this.handleResponse(message.id, 'test');
        break;
      case 'tool_usage_response':
        // Handle tool usage response from toolbar
        console.log(
          `Received tool usage response for ${message.payload.toolName}`,
        );
        this.handleResponse(message.id, message.payload.toolOutput);
        break;
    }
  }

  /**
   * Handles messages received from the extension
   * @param message The extension message to handle
   */
  private handleExtensionMessage(message: ExtensionToToolbarMessage) {
    switch (message.type) {
      case 'tool_usage_request':
        // Handle tool usage request to toolbar
        console.log(
          `Sending tool usage request for ${message.payload.toolName}`,
        );
        break;
      case 'prompt_trigger_response':
        // Handle prompt trigger response to toolbar
        console.log(
          `Sending prompt trigger response: ${message.payload.status}`,
        );
        break;
    }
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
