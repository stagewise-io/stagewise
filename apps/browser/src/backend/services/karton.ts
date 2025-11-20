import {
  createKartonServer,
  type KartonServer,
  ElectronServerTransport,
} from '@stagewise/karton/server';
import { type KartonContract, defaultState } from '@stagewise/karton-contract';
import type { Logger } from './logger';
import { ipcMain } from 'electron';

/**
 * The Karton service is responsible for managing the connection to the UI (web app).
 */
export class KartonService {
  private kartonServer: KartonServer<KartonContract>;
  private logger: Logger;

  private constructor(logger: Logger) {
    this.logger = logger;
  }

  private async initialize() {
    const transport = new ElectronServerTransport({
      ipcMain,
      channel: 'karton',
    });

    this.kartonServer = await createKartonServer<KartonContract>({
      initialState: defaultState,
      transport,
    });
    this.logger.debug(
      '[KartonService] Karton server initialized with Electron transport',
    );
  }

  public static async create(logger: Logger): Promise<KartonService> {
    const instance = new KartonService(logger);
    await instance.initialize();
    return instance;
  }

  get webSocketServer() {
    return this.kartonServer.wss;
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
    this.logger.debug('[KartonService] Registering server procedure handler');
    return this.kartonServer.registerServerProcedureHandler.bind(
      this.kartonServer,
    );
  }

  get removeServerProcedureHandler() {
    this.logger.debug('[KartonService] Removing server procedure handler');
    return this.kartonServer.removeServerProcedureHandler.bind(
      this.kartonServer,
    );
  }

  get registerStateChangeCallback() {
    this.logger.debug('[KartonService] Registering state change callback');
    return this.kartonServer.registerStateChangeCallback.bind(
      this.kartonServer,
    );
  }

  get unregisterStateChangeCallback() {
    this.logger.debug('[KartonService] Unregistering state change callback');
    return this.kartonServer.unregisterStateChangeCallback.bind(
      this.kartonServer,
    );
  }
}
