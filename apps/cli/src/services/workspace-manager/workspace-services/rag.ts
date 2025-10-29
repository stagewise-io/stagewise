import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { initializeRag, getRagMetadata } from '@stagewise/agent-rag';
import { isAuthenticationError } from '@stagewise/agent-utils';
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
  private authRetryCount = 0;
  private maxAuthRetries = 2;

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
  }

  private async initializeRagState() {
    const metadata = await getRagMetadata(this.workspaceDataPath);
    this.kartonService.setState((draft) => {
      draft.workspace!.rag = {
        lastIndexedAt: metadata.lastIndexedAt,
        indexedFiles: metadata.indexedFiles,
        statusInfo: { isIndexing: false },
      };
    });
  }

  private async resetRagStatusWithError(error: string) {
    this.kartonService.setState((draft) => {
      draft.workspace!.rag.statusInfo = {
        isIndexing: false,
        hasError: true,
        error,
      };
    });
  }

  private async updateRag(apiKey: string) {
    this.logger.debug('[RagService] Starting RAG update');
    let total = 0;
    try {
      for await (const update of initializeRag(
        this.workspaceDataPath,
        this.clientRuntime,
        apiKey,
        (error) => {
          // Check if this is an auth error - if so, throw to interrupt iteration
          if (isAuthenticationError(error)) {
            throw error;
          }
          // Non-auth errors are logged but don't interrupt the process
          this.telemetryService.captureException(error);
          this.logger.error('[RagService] Failed to initialize RAG', error);
        },
      )) {
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

      // Reset auth retry count on success
      this.authRetryCount = 0;
    } catch (error) {
      // Check if this is an authentication error
      if (isAuthenticationError(error)) {
        this.logger.log(
          'error',
          `[RagService Authentication]: Error, ${error}`,
        );

        if (this.authRetryCount < this.maxAuthRetries) {
          this.authRetryCount++;
          this.logger.debug(
            `[RagService] Retrying RAG update with fresh token (attempt ${this.authRetryCount}/${this.maxAuthRetries})`,
          );

          // Refresh auth tokens
          await this.authService.refreshAuthData();
          const tokens = await this.authService.getToken();

          if (!tokens) {
            this.authRetryCount = 0;
            this.resetRagStatusWithError(
              'Authentication failed - failed to refresh tokens',
            );
            return;
          }

          // Retry with fresh token
          await this.updateRag(tokens.accessToken);
          return;
        } else {
          // Exceeded max retries
          this.authRetryCount = 0;
          this.resetRagStatusWithError(
            'Authentication failed - please restart the CLI',
          );
          return;
        }
      }

      // Re-throw non-auth errors to be handled by caller
      throw error;
    }
  }

  private periodicallyUpdateRag(apiKey: string) {
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
        this.authRetryCount = 0; // Reset auth retry count on error
        this.resetRagStatusWithError(
          "Failed to update the codebase index - we'll try again later.",
        );
        if (this.updateRagInterval) clearInterval(this.updateRagInterval);
        this.updateRagInterval = null;
        this.periodicallyUpdateRag(apiKey);
      }
    }, 60 * 1000); // 60 seconds
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

      // Immediately run RAG update on creation
      void this.updateRag(apiKey);

      // Then periodically update RAG
      this.periodicallyUpdateRag(apiKey);

      this.logger.debug('[RagService] Initialized');
    } catch (error) {
      this.telemetryService.captureException(error as Error);
      this.logger.error('[RagService] Failed to initialize', error);
      this.authRetryCount = 0; // Reset auth retry count on error
      this.resetRagStatusWithError(
        "Failed to initialize the codebase index - we'll try again later.",
      );
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
