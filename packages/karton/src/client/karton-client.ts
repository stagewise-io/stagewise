import type {
  KartonClient,
  KartonClientConfig,
  KartonState,
  KartonServerProcedures,
  KartonClientProcedureImplementations,
} from '../shared/types.js';
import { WebSocketConnection } from '../shared/websocket-connection.js';
import { RPCManager } from '../shared/rpc.js';
import { ClientStateManager } from '../shared/state-sync.js';
import {
  createProcedureProxy,
  extractProceduresFromTree,
} from '../shared/procedure-proxy.js';
import { KartonRPCException, KartonRPCErrorReason } from '../shared/types.js';

class KartonClientImpl<T> implements KartonClient<T> {
  private ws: WebSocket | null = null;
  private connection: WebSocketConnection | null = null;
  private rpcManager: RPCManager | null = null;
  private stateManager: ClientStateManager<KartonState<T>>;
  private clientProcedures: KartonClientProcedureImplementations<T>;
  private config: KartonClientConfig<T>;
  private _serverProcedures: KartonServerProcedures<T>;
  private _isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectInterval = 500; // 500ms
  private onStateChange: (() => void) | undefined;

  constructor(config: KartonClientConfig<T>) {
    this.config = config;
    this.clientProcedures = config.procedures;
    this.onStateChange = config.onStateChange;

    // Initialize state manager with fallback state
    this.stateManager = new ClientStateManager(config.fallbackState);

    // Create server procedure proxy
    this._serverProcedures = createProcedureProxy(
      async (procedurePath, parameters, options) => {
        if (!this.rpcManager || !this._isConnected) {
          throw new KartonRPCException(
            KartonRPCErrorReason.SERVER_UNAVAILABLE,
            procedurePath,
          );
        }

        return await this.rpcManager.call(procedurePath, parameters, options);
      },
    ) as KartonServerProcedures<T>;

    // Start connection
    this.connect();
  }

  private connect(): void {
    try {
      // Create WebSocket connection
      this.ws = new WebSocket(this.config.webSocketPath);
      this.connection = new WebSocketConnection(this.ws);

      // Create RPC manager
      this.rpcManager = new RPCManager((message) => {
        if (this.connection?.isOpen()) {
          this.connection.send(message);
        }
      });

      // Register client procedures
      const procedures = extractProceduresFromTree(
        this.clientProcedures as any,
      );
      for (const [path, handler] of procedures) {
        this.rpcManager.registerProcedure(path.split('.'), handler);
      }

      // Setup message handling
      this.connection.onMessage(async (message) => {
        // Handle state messages
        this.stateManager.handleMessage(message, this.onStateChange);

        // Handle RPC messages
        if (this.rpcManager) {
          await this.rpcManager.handleMessage(message);
        }
      });

      // Handle connection open
      this.connection.onOpen(() => {
        this._isConnected = true;
        this.onStateChange?.();
        this.clearReconnectTimer();
      });

      // Handle connection close
      this.connection.onClose(() => {
        this._isConnected = false;
        this.onStateChange?.();
        this.scheduleReconnect();
      });

      // Handle errors
      this.connection.onError((error) => {
        console.error('WebSocket error:', error);
      });
    } catch (error) {
      console.error('Failed to connect:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    // Clear any existing reconnect timer
    this.clearReconnectTimer();

    // Schedule reconnection
    this.reconnectTimer = setTimeout(() => {
      this.cleanup();
      this.connect();
    }, this.reconnectInterval);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private cleanup(): void {
    if (this.rpcManager) {
      this.rpcManager.cleanup();
      this.rpcManager = null;
    }

    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }

    if (this.ws) {
      this.ws = null;
    }
  }

  public get state(): Readonly<KartonState<T>> {
    return this.stateManager.getState();
  }

  public get serverProcedures(): KartonServerProcedures<T> {
    return this._serverProcedures;
  }

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public close(): void {
    this.clearReconnectTimer();
    this.cleanup();
    this.onStateChange?.();
  }
}

export function createKartonClient<T>(
  config: KartonClientConfig<T>,
): KartonClient<T> {
  return new KartonClientImpl(config);
}
