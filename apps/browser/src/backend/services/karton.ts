import {
  createKartonServer,
  type KartonServer,
  ElectronServerTransport,
  type MessagePortMain,
} from '@stagewise/karton/server';
import { type KartonContract, defaultState } from '@shared/karton-contracts/ui';
import type { Logger } from './logger';

/**
 * The Karton service is responsible for managing the connection to the UI (web app).
 *
 * This service uses MessagePort-based transport for communication, which provides:
 * - Better isolation between different connections
 * - Support for multiple contract instances (UI and future tabs)
 * - Graceful handling of connection failures
 */
export class KartonService {
  private kartonServer: KartonServer<KartonContract>;
  private transport: ElectronServerTransport;
  private logger: Logger;

  constructor(logger: Logger) {
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
  public async teardown(): Promise<void> {
    this.logger.debug('[KartonService] Tearing down...');
    await this.transport.close();
    this.logger.debug('[KartonService] Teardown complete');
  }
}
