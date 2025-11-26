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

  private constructor(logger: Logger) {
    this.logger = logger;
  }

  private async initialize() {
    // Create transport without any initial configuration
    // Ports will be accepted dynamically via acceptPort()
    this.transport = new ElectronServerTransport();

    this.kartonServer = await createKartonServer<KartonContract>({
      initialState: defaultState,
      transport: this.transport,
    });

    this.logger.debug(
      '[KartonService] Karton server initialized with MessagePort transport',
    );
  }

  public static async create(logger: Logger): Promise<KartonService> {
    const instance = new KartonService(logger);
    await instance.initialize();
    return instance;
  }

  /**
   * Accept a new MessagePort connection.
   * This should be called by WindowLayoutService (or future TabManager)
   * after creating a port pair and sending one to the renderer.
   *
   * @param port - The MessagePortMain from the main process side
   * @param connectionId - Optional connection ID for tracking
   * @returns The connection ID assigned to this port
   */
  public acceptPort(port: MessagePortMain, connectionId?: string): string {
    const id = this.transport.acceptPort(port, connectionId);
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

  get registerServerProcedureHandler() {
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
