import { v4 as uuidv4 } from 'uuid';
import type { Draft } from 'immer';
import type { WebSocketServer } from 'ws';
import type {
  KartonServer,
  KartonServerConfig,
  Message,
  KartonState,
  KartonClientProceduresWithClientId,
} from '../shared/types.js';
import type { Transport, ServerTransport } from '../shared/transport.js';
import { WebSocketServerTransport } from '../transports/websocket/server.js';
import { RPCManager } from '../shared/rpc.js';
import { StateManager } from '../shared/state-sync.js';
import {
  createProcedureProxy,
  extractProceduresFromTree,
} from '../shared/procedure-proxy.js';
import {
  KartonRPCException,
  KartonRPCErrorReason,
  KartonProcedureError,
} from '../shared/types.js';

interface ClientConnection {
  id: string;
  transport: Transport;
  rpcManager: RPCManager;
}

class KartonServerImpl<T> implements KartonServer<T> {
  private transport: ServerTransport;
  private clients: Map<string, ClientConnection> = new Map();
  private stateManager: StateManager<KartonState<T>>;
  private serverProcedures: Map<string, any> = new Map();
  private _clientProcedures: KartonClientProceduresWithClientId<T>;
  private changeListeners: ((state: Readonly<KartonState<T>>) => void)[] = [];

  constructor(config: KartonServerConfig<T>, transport: ServerTransport) {
    this.transport = transport;

    // Initialize procedures from config if provided
    if (config.procedures) {
      const procedures = extractProceduresFromTree(config.procedures as any);
      for (const [pathStr, handler] of procedures) {
        this.serverProcedures.set(pathStr, handler);
      }
    }

    // Initialize state manager with broadcast function
    this.stateManager = new StateManager(config.initialState, (message) =>
      this.broadcast(message),
    );

    // Create client procedure proxy
    this._clientProcedures = createProcedureProxy(
      async (procedurePath, parameters, options) => {
        const clientId = parameters[0] as string;
        const actualParams = parameters.slice(1);

        const client = this.clients.get(clientId);
        if (!client) {
          throw new KartonRPCException(
            KartonRPCErrorReason.CLIENT_NOT_FOUND,
            procedurePath,
            clientId,
          );
        }

        try {
          return await client.rpcManager.call(
            procedurePath,
            actualParams,
            options,
          );
        } catch (error) {
          if (error instanceof Error && error.message.includes('Connection')) {
            throw new KartonRPCException(
              KartonRPCErrorReason.CONNECTION_LOST,
              procedurePath,
              clientId,
            );
          }
          throw error;
        }
      },
    ) as KartonClientProceduresWithClientId<T>;

    this.setupTransport();
  }

  private setupTransport(): void {
    this.transport.onConnection((clientTransport) => {
      this.handleNewConnection(clientTransport);
    });
  }

  private handleNewConnection(transport: Transport): void {
    const clientId = transport.getConnectionId?.() ?? uuidv4();

    // Create RPC manager for this client
    const rpcManager = new RPCManager((message) => {
      if (transport.isOpen()) {
        transport.send(message);
      }
    });

    // Register server procedures with clientId injection
    for (const [path, handler] of this.serverProcedures) {
      rpcManager.registerProcedure(path, async (...args: any[]) => {
        // Add clientId as last argument
        return handler(...args, clientId);
      });
    }

    // Setup message handling
    transport.onMessage(async (message) => {
      await rpcManager.handleMessage(message);
    });

    // Store client connection
    const client: ClientConnection = {
      id: clientId,
      transport,
      rpcManager,
    };
    this.clients.set(clientId, client);

    // Send initial state
    const initialStateMessage = this.stateManager.getFullStateSyncMessage();
    transport.send(initialStateMessage);

    // Start the transport to begin receiving messages
    transport.startTransport();

    // Handle disconnect
    transport.onClose(() => {
      this.clients.delete(clientId);
      rpcManager.cleanup();
    });
  }

  private broadcast(message: Message): void {
    // We serialize once here if we wanted optimization, but Transport interface doesn't support raw.
    // So we iterate and send object.
    for (const client of this.clients.values()) {
      if (client.transport.isOpen()) {
        client.transport.send(message);
      }
    }
  }

  public get wss(): WebSocketServer | undefined {
    if (this.transport instanceof WebSocketServerTransport) {
      return this.transport.wssInstance;
    }
    return undefined;
  }

  public get state(): Readonly<KartonState<T>> {
    return this.stateManager.getState();
  }

  public setState(
    recipe: (draft: Draft<KartonState<T>>) => void,
  ): KartonState<T> {
    const oldState = this.state;
    const newState = this.stateManager.setState(recipe);
    this.notifyStateChangeCallbacks(newState, oldState);
    return newState;
  }

  public get clientProcedures(): KartonClientProceduresWithClientId<T> {
    return this._clientProcedures;
  }

  public get connectedClients(): ReadonlyArray<string> {
    return Array.from(this.clients.keys());
  }

  public registerServerProcedureHandler<Path extends string>(
    path: Path,
    handler: any,
  ): void {
    // Check if already registered
    if (this.serverProcedures.has(path)) {
      throw new KartonProcedureError(
        `Server procedure '${path}' is already registered. Remove it first before registering a new handler.`,
      );
    }

    // Store the handler
    this.serverProcedures.set(path, handler);

    // Register with all existing client connections
    for (const client of this.clients.values()) {
      client.rpcManager.registerProcedure(path, async (...args: any[]) => {
        // Add clientId as last argument
        return handler(...args, client.id);
      });
    }
  }

  public removeServerProcedureHandler(path: string): void {
    // Remove from stored procedures
    this.serverProcedures.delete(path);

    // Unregister from all existing client connections
    for (const client of this.clients.values()) {
      client.rpcManager.unregisterProcedure(path);
    }
  }

  public async close(): Promise<void> {
    for (const client of this.clients.values()) {
      client.rpcManager.cleanup();
      client.transport.close();
    }
    this.clients.clear();

    await this.transport.close();
  }

  public registerStateChangeCallback(
    callback: (state: Readonly<KartonState<T>>) => void,
  ): void {
    this.changeListeners.push(callback);
  }

  public unregisterStateChangeCallback(
    callback: (state: Readonly<KartonState<T>>) => void,
  ): void {
    this.changeListeners = this.changeListeners.filter(
      (listener) => listener !== callback,
    );
  }

  private notifyStateChangeCallbacks(
    state: Readonly<KartonState<T>>,
    oldState: Readonly<KartonState<T>>,
  ): void {
    if (oldState === state) return;
    // TODO Check if the paths have actually changed for each callback and notify accordingly.
    this.changeListeners.forEach((listener) => listener(state));
  }
}

export async function createKartonServer<T>(
  config: KartonServerConfig<T>,
): Promise<KartonServer<T>> {
  let transport: ServerTransport;

  if (config.transport) {
    transport = config.transport;
  } else {
    transport = new WebSocketServerTransport({ noServer: true });
  }

  // Create and return the server implementation
  const server = new KartonServerImpl(config, transport);
  return server;
}
