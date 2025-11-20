import type {
  Transport,
  ServerTransport,
  KartonMessage,
} from '../shared/transport.js';
import {
  serializeMessage,
  deserializeMessage,
} from '../shared/websocket-messages.js';

interface IpcMain {
  on(channel: string, listener: (event: any, ...args: any[]) => void): void;
  removeListener(channel: string, listener: (...args: any[]) => void): void;
}

export interface ElectronServerTransportConfig {
  ipcMain: IpcMain;
  channel?: string;
}

class ElectronServerConnection implements Transport {
  private sender: any;
  private channel: string;
  private messageHandler: ((message: KartonMessage) => void) | null = null;
  private closeHandler:
    | ((event?: { code: number; reason: string }) => void)
    | null = null;
  private _isOpen = true;

  constructor(sender: any, channel: string) {
    this.sender = sender;
    this.channel = channel;
  }

  // Called by ServerTransport when data is received for this connection
  public handleData(data: string) {
    if (this.messageHandler) {
      try {
        const message = deserializeMessage(data);
        this.messageHandler(message);
      } catch (e) {
        console.error(
          'Failed to handle message in ElectronServerConnection',
          e,
        );
      }
    }
  }

  // Called by ServerTransport when connection is replaced/closed
  public triggerClose() {
    this._isOpen = false;
    this.closeHandler?.({
      code: 1000,
      reason: 'Connection replaced or closed',
    });
  }

  send(message: KartonMessage): void {
    if (!this._isOpen) return;
    try {
      const serialized = serializeMessage(message);
      this.sender.send(this.channel, serialized);
    } catch (_e) {
      // Sender might be destroyed
      this.triggerClose();
    }
  }

  onMessage(handler: (message: KartonMessage) => void): () => void {
    this.messageHandler = handler;
    return () => {
      this.messageHandler = null;
    };
  }

  close(): void {
    this.triggerClose();
  }

  isOpen(): boolean {
    return this._isOpen && !this.sender.isDestroyed?.();
  }

  onOpen(handler: () => void): () => void {
    // Always open when created
    handler();
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

  onError(_handler: (error: Error) => void): () => void {
    // Not implemented for now
    return () => {};
  }
}

export class ElectronServerTransport implements ServerTransport {
  private ipcMain: IpcMain;
  private channel: string;
  private connections = new Map<number, ElectronServerConnection>();
  private connectionHandler: ((clientTransport: Transport) => void) | null =
    null;
  private _listener: (event: any, arg: any) => void;

  constructor(config: ElectronServerTransportConfig) {
    this.ipcMain = config.ipcMain;
    this.channel = config.channel || 'karton';
    this._listener = (event, arg) => this.handleIpcMessage(event, arg);
    this.ipcMain.on(this.channel, this._listener);
  }

  private handleIpcMessage(event: any, arg: any) {
    const senderId = event.sender.id;

    if (arg === 'CONNECT') {
      // Handle new connection
      if (this.connections.has(senderId)) {
        // Close existing
        this.connections.get(senderId)?.triggerClose();
        this.connections.delete(senderId);
      }

      const connection = new ElectronServerConnection(
        event.sender,
        this.channel,
      );
      this.connections.set(senderId, connection);

      // Detect sender destruction to cleanup
      if (event.sender.once) {
        event.sender.once('destroyed', () => {
          if (this.connections.get(senderId) === connection) {
            connection.triggerClose();
            this.connections.delete(senderId);
          }
        });
      }

      this.connectionHandler?.(connection);
    } else {
      // Handle data
      const connection = this.connections.get(senderId);
      if (connection) {
        connection.handleData(arg);
      } else {
        // Message from unknown connection, maybe restart required?
        // Ignore or send error back?
      }
    }
  }

  onConnection(handler: (clientTransport: Transport) => void): void {
    this.connectionHandler = handler;
  }

  async close(): Promise<void> {
    this.ipcMain.removeListener(this.channel, this._listener);
    for (const conn of this.connections.values()) {
      conn.triggerClose();
    }
    this.connections.clear();
  }
}
