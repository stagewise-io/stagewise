import type {
  Transport,
  ServerTransport,
  KartonMessage,
} from '../../shared/transport.js';

/**
 * Electron's MessagePortMain interface (main process side).
 * This is a subset of the full MessagePortMain API that we need.
 */
export interface MessagePortMain {
  postMessage(message: any): void;
  start(): void;
  close(): void;
  on(event: 'message', listener: (messageEvent: { data: any }) => void): this;
  on(event: 'close', listener: () => void): this;
  off(event: 'message', listener: (messageEvent: { data: any }) => void): this;
  off(event: 'close', listener: () => void): this;
  once(event: 'message', listener: (messageEvent: { data: any }) => void): this;
  once(event: 'close', listener: () => void): this;
}

/**
 * Configuration for ElectronServerTransport.
 * This transport does not require any initial configuration as ports
 * are accepted dynamically via the acceptPort method.
 */
export type ElectronServerTransportConfig = Record<string, never>;

/**
 * A single connection to a client via MessagePort.
 * Created when a port is accepted by the server transport.
 */
class ElectronServerConnection implements Transport {
  private port: MessagePortMain;
  private connectionId: string;
  private messageHandler: ((message: KartonMessage) => void) | null = null;
  private closeHandler:
    | ((event?: { code: number; reason: string }) => void)
    | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private _isOpen = true;
  private _messageListener: ((event: { data: KartonMessage }) => void) | null =
    null;
  private _closeListener: (() => void) | null = null;

  constructor(port: MessagePortMain, connectionId: string) {
    this.port = port;
    this.connectionId = connectionId;
  }

  public startTransport(): void {
    // Setup message listener
    this._messageListener = (event) => {
      this.handleData(event.data);
    };
    this.port.on('message', this._messageListener);

    // Setup close listener
    this._closeListener = () => {
      this.triggerClose('Port closed by remote');
    };
    this.port.on('close', this._closeListener);
  }

  /**
   * Get the connection ID for this connection.
   */
  public getConnectionId(): string {
    return this.connectionId;
  }

  /**
   * Handle incoming data from the port.
   */
  private handleData(message: KartonMessage): void {
    if (!this._isOpen) return;

    try {
      this.messageHandler?.(message);
    } catch (err) {
      this.errorHandler?.(
        err instanceof Error ? err : new Error('Failed to deserialize message'),
      );
    }
  }

  /**
   * Trigger connection close with a reason.
   * @param reason - The reason for closing
   * @param closePort - Whether to also close the underlying port (default: true)
   */
  public triggerClose(reason = 'Connection closed', closePort = true): void {
    if (!this._isOpen) return;

    this._isOpen = false;

    // Remove listeners
    if (this._messageListener) {
      this.port.off('message', this._messageListener);
      this._messageListener = null;
    }
    if (this._closeListener) {
      this.port.off('close', this._closeListener);
      this._closeListener = null;
    }

    // Close the underlying port to free resources
    if (closePort) {
      try {
        this.port.close();
      } catch {
        // Port may already be closed
      }
    }

    // Notify close handler
    this.closeHandler?.({
      code: 1000,
      reason,
    });
  }

  /**
   * Send a message through the port.
   * Fails silently if the port is closed (for state sync).
   */
  send(message: KartonMessage): void {
    if (!this._isOpen) {
      return;
    }

    try {
      this.port.postMessage(message);
    } catch {
      // Port may have been closed unexpectedly
      this.triggerClose('Send failed - port may be closed');
    }
  }

  onMessage(handler: (message: KartonMessage) => void): () => void {
    this.messageHandler = handler;
    return () => {
      this.messageHandler = null;
    };
  }

  close(): void {
    if (!this._isOpen) return;

    // triggerClose will also close the port
    this.triggerClose('Closed by server', true);
  }

  isOpen(): boolean {
    return this._isOpen;
  }

  onOpen(handler: () => void): () => void {
    // Connection is already open when created
    if (this._isOpen) {
      handler();
    }
    return () => {};
  }

  onClose(
    handler: (event?: { code: number; reason: string }) => void,
  ): () => void {
    this.closeHandler = handler;
    return () => {
      this.closeHandler = null;
    };
  }

  onError(handler: (error: Error) => void): () => void {
    this.errorHandler = handler;
    return () => {
      this.errorHandler = null;
    };
  }
}

/**
 * Server-side transport for Electron using MessagePort.
 *
 * Unlike the IPC-based transport, this transport accepts ports dynamically
 * via the acceptPort() method. Ports are created externally (typically by
 * a PortBridgeService) and passed to this transport.
 *
 * This allows for:
 * - Multiple isolated connections (UI, tabs, etc.)
 * - Better differentiation between contract types
 * - Graceful handling of connection failures
 */
export class ElectronServerTransport implements ServerTransport {
  private connections = new Map<string, ElectronServerConnection>();
  private connectionHandler: ((serverTransport: Transport) => void) | null =
    null;

  /**
   * Set a new MessagePort as a transport port.
   *
   * @param port - The MessagePortMain from Electron's MessageChannelMain
   * @param connectionId - Optional custom connection ID. If not provided, an auto-generated ID will be used.
   * @returns The connection ID for this port
   */
  public setPort(port: MessagePortMain, connectionId?: string): string {
    const id = connectionId ?? crypto.randomUUID();

    // Close existing connection with same ID if present
    const existing = this.connections.get(id);
    if (existing) {
      existing.triggerClose('Connection replaced');
      this.connections.delete(id);
    }

    // Create new connection
    const connection = new ElectronServerConnection(port, id);
    this.connections.set(id, connection);

    // Setup cleanup on close
    connection.onClose(() => {
      if (this.connections.get(id) === connection) {
        this.connections.delete(id);
      }
    });

    // Notify connection handler
    this.connectionHandler?.(connection);

    return id;
  }

  /**
   * Get a connection by its ID.
   */
  public getConnection(connectionId: string): Transport | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all active connection IDs.
   */
  public getConnectionIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Check if a connection exists.
   */
  public hasConnection(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }

  /**
   * Close a specific connection by ID.
   */
  public closeConnection(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.close();
      this.connections.delete(connectionId);
      return true;
    }
    return false;
  }

  onConnection(handler: (clientTransport: Transport) => void): void {
    this.connectionHandler = handler;
  }

  async close(): Promise<void> {
    // Close all connections
    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.connections.clear();
    this.connectionHandler = null;
  }
}
