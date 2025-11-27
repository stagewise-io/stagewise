import type {
  KartonClient,
  KartonClientConfig,
  KartonState,
  KartonServerProcedures,
  KartonClientProcedureImplementations,
} from '../shared/types.js';
import type { Transport } from '../shared/transport.js';
import { WebSocketTransport } from '../transports/websocket/client.js';
import { RPCManager } from '../shared/rpc.js';
import { ClientStateManager } from '../shared/state-sync.js';
import {
  createProcedureProxy,
  extractProceduresFromTree,
} from '../shared/procedure-proxy.js';
import { KartonRPCException, KartonRPCErrorReason } from '../shared/types.js';

class KartonClientImpl<T> implements KartonClient<T> {
  private transport: Transport | null = null;
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
      // Create Transport
      if (this.config.transport) {
        // Use provided transport (assuming it's fresh or reusable)
        // If it's a reconnect, we might be reusing the same instance which might be closed.
        // But custom transports should handle their lifecycle or be provided via factory if we supported that.
        // For now, we assume if transport is passed, we just use it.
        this.transport = this.config.transport;
      } else if (this.config.webSocketPath) {
        this.transport = new WebSocketTransport(this.config.webSocketPath);
      } else {
        throw new Error(
          'Either transport or webSocketPath must be provided in KartonClientConfig',
        );
      }

      // Create RPC manager
      this.rpcManager = new RPCManager((message) => {
        if (this.transport?.isOpen()) {
          this.transport.send(message);
        }
      });

      // Register client procedures
      const procedures = extractProceduresFromTree(
        this.clientProcedures as any,
      );
      for (const [path, handler] of procedures) {
        this.rpcManager.registerProcedure(path, handler);
      }

      // Setup message handling
      this.transport.onMessage(async (message) => {
        // Handle state messages
        this.stateManager.handleMessage(message, this.onStateChange);

        // Handle RPC messages
        if (this.rpcManager) {
          await this.rpcManager.handleMessage(message);
        }
      });

      // Handle connection open
      this.transport.onOpen(() => {
        this._isConnected = true;
        this.onStateChange?.();
        this.clearReconnectTimer();
      });

      // Handle connection close
      this.transport.onClose(() => {
        this._isConnected = false;
        this.onStateChange?.();
        // Only schedule reconnect if we are managing the transport (WebSocket mode)
        if (this.config.webSocketPath) {
          this.scheduleReconnect();
        }
      });

      // Handle errors
      this.transport.onError((error) => {
        console.error('Transport error:', error);
      });

      this.transport.startTransport();
    } catch (error) {
      console.error('Failed to connect:', error);
      if (this.config.webSocketPath) {
        this.scheduleReconnect();
      }
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

    if (this.transport) {
      // Only close if we created it? Or always?
      // If user passed transport, closing it might be side-effect.
      // But cleanup usually means we are done or restarting.
      // If we are restarting (reconnect), we want to close old one.
      try {
        this.transport.close();
      } catch (_e) {
        // Ignore
      }
      this.transport = null;
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
