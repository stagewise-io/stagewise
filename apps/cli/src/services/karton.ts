import {
  createKartonServer,
  type KartonServer,
} from '@stagewise/karton/server';
import type { KartonContract } from '@stagewise/karton-contract';
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
      initialState: this.initialState,
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

  private initialState: KartonContract['state'] = {
    workspace: null,
    workspaceStatus: 'closed',
    userAccount: {
      status: 'unauthenticated',
      loginDialog: null,
    },
    appInfo: {
      bridgeMode: false,
      envMode: 'production',
      verbose: false,
      version: 'UNKNOWN',
      runningOnPort: 0,
    },
    globalConfig: {
      telemetryLevel: 'off',
    },
    userExperience: {},
    filePicker: null,
    notifications: [],
  };
}
