import { WebSocket } from 'ws';
import {
  type WebSocketMessage,
  type ExtensionToToolbarMessage,
  type ToolbarToExtensionMessage,
  WebSocketConnectionManager,
  type ToolbarCommandType,
  type CommandToPayloadMap,
} from '@stagewise/srpc';

/**
 * Client-side WebSocket implementation that extends the base WebSocketConnectionManager.
 * This class provides specific functionality for client-side WebSocket communication
 * with the toolbar, including:
 * - Connection establishment
 * - Message type handling
 * - Command sending
 */
export class WebSocketClient extends WebSocketConnectionManager {
  private url: string;

  /**
   * Creates a new WebSocketClient instance
   * @param url The WebSocket server URL to connect to
   */
  constructor(url: string) {
    super();
    this.url = url;
  }

  /**
   * Establishes a connection to the WebSocket server
   * @returns Promise that resolves when the connection is established
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.setupWebSocketHandlers(this.ws);
    });
  }

  /**
   * Handles incoming requests from the extension
   * @param message The request message to handle
   */
  protected handleRequest(message: WebSocketMessage) {
    if (this.isExtensionRequest(message)) {
      this.handleExtensionRequest(message);
    } else if (this.isToolbarRequest(message)) {
      this.handleToolbarRequest(message);
    }
  }

  /**
   * Type guard to check if a message is from the toolbar
   * @param message The message to check
   * @returns true if the message is from the toolbar
   */
  private isToolbarRequest(
    message: WebSocketMessage,
  ): message is ToolbarToExtensionMessage {
    return (
      message.type === 'prompt_trigger_request' ||
      message.type === 'tool_usage_response'
    );
  }

  /**
   * Type guard to check if a message is from the extension
   * @param message The message to check
   * @returns true if the message is from the extension
   */
  private isExtensionRequest(
    message: WebSocketMessage,
  ): message is ExtensionToToolbarMessage {
    return (
      message.type === 'tool_usage_request' ||
      message.type === 'prompt_trigger_response'
    );
  }

  /**
   * Handles messages received from the toolbar
   * @param message The toolbar message to handle
   */
  private handleToolbarRequest(message: ToolbarToExtensionMessage) {
    // Handle toolbar messages if needed
    // TODO: Implement this and send response back
  }

  /**
   * Handles messages received from the extension
   * @param message The extension message to handle
   */
  private handleExtensionRequest(message: ExtensionToToolbarMessage) {
    if (message.type === 'tool_usage_request') {
      const response = {
        type: 'tool_usage_response',
        messageType: 'response',
        id: message.id,
        payload: {
          status: 'success',
        },
      };
      this.ws?.send(JSON.stringify(response));
    } else if (message.type === 'prompt_trigger_response') {
      const response = {
        type: 'prompt_trigger_response',
        messageType: 'response',
        id: message.id,
        payload: {
          status: 'success',
        },
      };
      this.ws?.send(JSON.stringify(response));
    }
  }

  /**
   * Sends a command to the toolbar with optional payload
   * @param command The command to send
   * @param payload The command payload
   * @param timeoutMs Optional timeout in milliseconds
   * @returns Promise that resolves when the command is sent
   */
  public async sendCommand<K extends ToolbarCommandType>(
    type: K,
    message: CommandToPayloadMap[K],
    timeoutMs = 5000,
  ): Promise<unknown> {
    return await this.sendRequest(message, timeoutMs);
  }

  /**
   * Implements the reconnection logic by attempting to reconnect to the server
   * @returns Promise that resolves when reconnection is complete
   */
  protected reconnect(): Promise<void> {
    return this.connect();
  }
}
