import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { initializeRag, LevelDb } from '@stagewise/agent-rag';
import type { KartonService } from '../../karton';
import type { Logger } from '../../logger';
import type { TelemetryService } from '../../telemetry';
import type { AuthService } from '../../auth';

export class RagService {
  private logger: Logger;
  private telemetryService: TelemetryService;
  private kartonService: KartonService;
  private authService: AuthService;
  private clientRuntime: ClientRuntime;
  private workspaceDataPath: string;
  private updateRagInterval: NodeJS.Timeout | null = null;
  private levelDb: LevelDb;

  private constructor(
    logger: Logger,
    telemetryService: TelemetryService,
    kartonService: KartonService,
    authService: AuthService,
    clientRuntime: ClientRuntime,
    workspaceDataPath: string,
  ) {
    this.logger = logger;
    this.telemetryService = telemetryService;
    this.kartonService = kartonService;
    this.authService = authService;
    this.clientRuntime = clientRuntime;
    this.workspaceDataPath = workspaceDataPath;
    this.levelDb = LevelDb.getInstance(workspaceDataPath);
  }

  private async initializeRagState() {
    await this.levelDb.open();
    const metadata = await this.levelDb.meta.get('schema');
    if (!metadata) {
      this.kartonService.setState((draft) => {
        draft.workspace!.rag = {
          lastIndexedAt: null,
          indexedFiles: 0,
          statusInfo: { isIndexing: false },
        };
      });
    } else {
      this.kartonService.setState((draft) => {
        draft.workspace!.rag = {
          lastIndexedAt: metadata.rag.lastIndexedAt,
          indexedFiles: metadata.rag.indexedFiles,
          statusInfo: { isIndexing: false },
        };
      });
    }
    await this.levelDb.close();
  }

  private async resetRagStatus(error?: string) {
    this.kartonService.setState((draft) => {
      draft.workspace!.rag.statusInfo = {
        isIndexing: false,
        error,
      };
    });
  }

  private async updateRag(apiKey: string) {
    let total = 0;
    for await (const update of initializeRag(
      this.workspaceDataPath,
      this.clientRuntime,
      apiKey,
      (error) => {
        this.telemetryService.captureException(error);
        this.logger.error('[RagService] Failed to initialize RAG', error);
      },
    )) {
      this.logger.debug(`updating rag: ${update.progress}/${update.total}`);
      this.kartonService.setState((draft) => {
        draft.workspace!.rag.statusInfo = {
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
    await this.initializeRagState();
  }

  private async periodicallyUpdateRag(apiKey: string) {
    this.updateRagInterval = setInterval(async () => {
      try {
        if (this.kartonService.state.workspace?.rag?.statusInfo?.isIndexing) {
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
        this.resetRagStatus(
          "Failed to update the codebase index - we'll try again later.",
        );
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
      this.resetRagStatus();
    }
  }

  private registerProcedureHandlers() {
    // implement procedure handlers (such as 're-index codebase') here once needed
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
    workspaceDataPath: string,
  ) {
    const instance = new RagService(
      logger,
      telemetryService,
      kartonService,
      authService,
      clientRuntime,
      workspaceDataPath,
    );
    await instance.initializeRagState();
    await instance.initialize();
    logger.debug('[RagService] Created service');
    return instance;
  }
}
