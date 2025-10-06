import {
  createKartonServer,
  type KartonServer,
} from '@stagewise/karton/server';
import { type KartonContract, defaultState } from '@stagewise/karton-contract';
import type { Logger } from './logger';

/**
 * The Karton service is responsible for managing the connection to the UI (web app).
 */
export class KartonService {
  // @ts-expect-error - We initialize the karton server in the initialize method.
  private kartonServer: KartonServer<KartonContract>;
  private logger: Logger;

  private constructor(logger: Logger) {
    this.logger = logger;
  }

  private async initialize() {
    this.kartonServer = await createKartonServer<KartonContract>({
      initialState: defaultState,
    });
    this.logger.debug('[KartonService] Karton server initialized');
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
    return this.kartonServer.registerServerProcedureHandler.bind(
      this.kartonServer,
    );
  }

  get removeServerProcedureHandler() {
    return this.kartonServer.removeServerProcedureHandler.bind(
      this.kartonServer,
    );
  }
}
