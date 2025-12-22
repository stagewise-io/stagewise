import {
  createKartonServer,
  type KartonServer,
  ElectronServerTransport,
  type MessagePortMain,
} from '@stagewise/karton/server';
import { type KartonContract, defaultState } from '@shared/karton-contracts/ui';
import type { Logger } from './logger';
import { DisposableService } from './disposable';

/**
 * The Karton service is responsible for managing the connection to the UI (web app).
 *
 * This service uses MessagePort-based transport for communication, which provides:
 * - Better isolation between different connections
 * - Support for multiple contract instances (UI and future tabs)
 * - Graceful handling of connection failures
 * - Auto-reconnection support
 */
export class KartonService extends DisposableService {
  private kartonServer: KartonServer<KartonContract>;
  private transport: ElectronServerTransport;
  private readonly logger: Logger;
  private currentPort?: MessagePortMain;
  private portCloseListeners = new Map<MessagePortMain, () => void>();

  constructor(logger: Logger) {
    super();
    this.logger = logger;

    // Create transport without any initial configuration
    // Ports will be accepted dynamically via acceptPort()
    this.transport = new ElectronServerTransport();

    this.kartonServer = createKartonServer<KartonContract>({
      initialState: defaultState,
      transport: this.transport,
    });

    this.logger.debug(
      '[KartonService] Karton server initialized with MessagePort transport',
    );
  }

  /**
   * Accept a new MessagePort connection.
   *
   * @param port - The MessagePortMain from the main process side
   * @returns The connection ID assigned to this port
   */
  public setTransportPort(port: MessagePortMain): string {
    // Remove listener from old port if it exists
    if (this.currentPort) {
      const oldListener = this.portCloseListeners.get(this.currentPort);
      if (oldListener) {
        this.currentPort.off('close', oldListener);
        this.portCloseListeners.delete(this.currentPort);
      }
    }

    // Store the new port
    this.currentPort = port;

    // Setup close listener for connection monitoring
    const closeListener = () => {
      this.logger.warn('[KartonService] MessagePort closed - connection lost');
      // Clean up the listener reference
      if (this.currentPort) {
        this.portCloseListeners.delete(this.currentPort);
      }
    };

    // Store the listener so we can remove it later
    this.portCloseListeners.set(port, closeListener);
    port.on('close', closeListener);

    // Accept the port in the transport
    const id = this.transport.setPort(port, 'ui-main');
    this.logger.debug(`[KartonService] Accepted port connection: ${id}`);

    return id;
  }

  /**
   * Check if a connection exists.
   */
  public hasConnection(connectionId: string): boolean {
    return this.transport.hasConnection(connectionId);
  }

  /**
   * Get all active connection IDs.
   */
  public getConnectionIds(): string[] {
    return this.transport.getConnectionIds();
  }

  /**
   * Close a specific connection.
   */
  public closeConnection(connectionId: string): boolean {
    const result = this.transport.closeConnection(connectionId);
    if (result) {
      this.logger.debug(`[KartonService] Closed connection: ${connectionId}`);
    }
    return result;
  }

  get clientProcedures() {
    return this.kartonServer.clientProcedures;
  }

  get state() {
    return this.kartonServer.state;
  }

  get setState() {
    return this.kartonServer.setState.bind(this.kartonServer);
  }

  get registerServerProcedureHandler(): KartonServer<KartonContract>['registerServerProcedureHandler'] {
    return this.kartonServer.registerServerProcedureHandler.bind(
      this.kartonServer,
    );
  }

  get removeServerProcedureHandler() {
    return this.kartonServer.removeServerProcedureHandler.bind(
      this.kartonServer,
    );
  }

  get registerStateChangeCallback() {
    return this.kartonServer.registerStateChangeCallback.bind(
      this.kartonServer,
    );
  }

  get unregisterStateChangeCallback() {
    return this.kartonServer.unregisterStateChangeCallback.bind(
      this.kartonServer,
    );
  }

  /**
   * Close all connections and clean up resources.
   */
  protected async onTeardown(): Promise<void> {
    this.logger.debug('[KartonService] Tearing down...');

    // Clean up all port close listeners
    for (const [port, listener] of this.portCloseListeners.entries()) {
      port.off('close', listener);
    }
    this.portCloseListeners.clear();
    this.currentPort = undefined;

    await this.transport.close();
    this.logger.debug('[KartonService] Teardown complete');
  }
}
