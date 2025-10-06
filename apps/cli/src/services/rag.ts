import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { initializeRag } from '@stagewise/agent-rag';
import type { KartonService } from './karton';
import type { Logger } from './logger';
import type { TelemetryService } from './telemetry';
import type { AuthService } from './auth';

export class RagService {
  private logger: Logger;
  private telemetryService: TelemetryService;
  private kartonService: KartonService;
  private authService: AuthService;
  private clientRuntime: ClientRuntime;
  private updateRagInterval: NodeJS.Timeout | null = null;

  private constructor(
    logger: Logger,
    telemetryService: TelemetryService,
    kartonService: KartonService,
    authService: AuthService,
    clientRuntime: ClientRuntime,
  ) {
    this.logger = logger;
    this.telemetryService = telemetryService;
    this.kartonService = kartonService;
    this.authService = authService;
    this.clientRuntime = clientRuntime;

    this.kartonService.setState((draft) => {
      if (!draft.workspace?.rag) {
        draft.workspace!.rag = {
          isIndexing: false,
          indexProgress: 0,
          indexTotal: 0,
        };
      }
    });
  }

  private async resetRagState() {
    this.kartonService.setState((draft) => {
      draft.workspace!.rag = {
        isIndexing: false,
        indexProgress: 0,
        indexTotal: 0,
      };
    });
  }

  private async updateRag(apiKey: string) {
    this.kartonService.setState((draft) => {
      draft.workspace!.rag = {
        isIndexing: true,
        indexProgress: 0,
        indexTotal: 0,
      };
    });
    let total = 0;
    for await (const update of initializeRag(this.clientRuntime, apiKey)) {
      this.logger.debug(`updating rag: ${update.progress}/${update.total}`);
      this.kartonService.setState((draft) => {
        draft.workspace!.rag = {
          isIndexing: true,
          indexProgress: update.progress,
          indexTotal: update.total,
        };
      });
      total = update.total;
    }
    this.telemetryService.capture('rag-updated', {
      index_progress: total,
      index_total: total,
    });
    this.kartonService.setState((draft) => {
      draft.workspace!.rag = {
        isIndexing: false,
        indexProgress: total,
        indexTotal: total,
      };
    });
  }

  private async periodicallyUpdateRag(apiKey: string) {
    this.updateRagInterval = setInterval(async () => {
      try {
        if (this.kartonService.state.workspace?.rag?.isIndexing) {
          if (this.updateRagInterval) clearInterval(this.updateRagInterval);
          this.updateRagInterval = null;
          this.periodicallyUpdateRag(apiKey);
          return;
        }

        await this.updateRag(apiKey);
      } catch (error) {
        this.telemetryService.captureException(error as Error);
        this.logger.error(
          '[RagService] Failed to periodically update RAG',
          error,
        );
        this.resetRagState();
        if (this.updateRagInterval) clearInterval(this.updateRagInterval);
        this.updateRagInterval = null;
        this.periodicallyUpdateRag(apiKey);
      }
    }, 60 * 1000); // 1 Minute
  }

  public async initialize() {
    try {
      const tokens = await this.authService.getToken();
      const apiKey = tokens?.accessToken;
      if (!apiKey) {
        this.logger.debug('[RagService] No authentication tokens available');
        return;
      }

      this.logger.debug('[RagService] Initializing...');

      // Register all karton procedure handlers
      this.registerProcedureHandlers();

      // Update RAG
      await this.updateRag(apiKey);

      // Periodically update RAG
      this.periodicallyUpdateRag(apiKey);

      this.logger.debug('[RagService] Initialized');
    } catch (error) {
      this.telemetryService.captureException(error as Error);
      this.logger.error('[RagService] Failed to initialize', error);
      this.resetRagState();
    }
  }

  private registerProcedureHandlers() {
    // TODO: implement the right procedure handlers
    // this.kartonService.registerServerProcedureHandler(
    //   'agentChat.undoToolCallsUntilUserMessage',
    //   async (userMessageId: string, chatId: string) => {},
    // );
  }

  private removeServerProcedureHandlers() {}

  /**
   * Teardown the RAG service
   */
  public teardown() {
    this.removeServerProcedureHandlers();
    this.cleanupPendingOperations('Rag teardown');
    this.logger.debug('[RagService] Shutdown complete');
  }

  private async cleanupPendingOperations(reason?: string) {
    this.logger.debug('[RagService] Cleaning up pending operations', reason);
    if (this.updateRagInterval) {
      clearInterval(this.updateRagInterval);
      this.updateRagInterval = null;
    }
  }

  public static async create(
    logger: Logger,
    telemetryService: TelemetryService,
    kartonService: KartonService,
    authService: AuthService,
    clientRuntime: ClientRuntime,
  ) {
    const instance = new RagService(
      logger,
      telemetryService,
      kartonService,
      authService,
      clientRuntime,
    );
    await instance.initialize();
    logger.debug('[RagService] Created service');
    return instance;
  }
}
