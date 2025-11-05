import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { initializeRag, getRagMetadata } from '@stagewise/agent-rag';
import {
  getContextFilesFromSelectedElement,
  isAuthenticationError,
} from '@stagewise/agent-utils';
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
  private litellm!: ReturnType<typeof createGoogleGenerativeAI>;
  private apiKey!: string;

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

  private async updateRag() {
    this.logger.debug('[RagService] Starting RAG update');
    let total = 0;
    try {
      for await (const update of initializeRag(
        this.workspaceDataPath,
        this.clientRuntime,
        this.apiKey,
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
          await this.authService.refreshAuthState();
          await this.initializeLitellm();
          // Retry with fresh token
          await this.updateRag();
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

  private periodicallyUpdateRag() {
    this.updateRagInterval = setInterval(async () => {
      try {
        if (this.kartonService.state.workspace?.rag?.statusInfo?.isIndexing) {
          if (this.updateRagInterval) clearInterval(this.updateRagInterval);
          this.updateRagInterval = null;
          this.periodicallyUpdateRag();
          return;
        }

        await this.updateRag();
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
        this.periodicallyUpdateRag();
      }
    }, 60 * 1000); // 60 seconds
  }

  private async initializeLitellm() {
    const LLM_PROXY_URL =
      process.env.LLM_PROXY_URL || 'https://llm.stagewise.io';
    const accessToken = await this.authService.accessToken;
    if (!accessToken) {
      throw new Error('No authentication tokens available');
    }
    this.apiKey = accessToken;
    this.litellm = createGoogleGenerativeAI({
      baseURL: `${LLM_PROXY_URL}`,
      apiKey: this.apiKey,
    });
  }

  public async initialize() {
    try {
      await this.initializeLitellm();

      this.logger.debug('[RagService] Initializing...');

      // Register all karton procedure handlers
      this.registerProcedureHandlers();

      // Immediately run RAG update on creation
      void this.updateRag();

      // Then periodically update RAG
      this.periodicallyUpdateRag();

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
    this.kartonService.registerServerProcedureHandler(
      'agentChat.getContextElementFiles',
      async (element) => {
        const files = await getContextFilesFromSelectedElement(
          element,
          this.apiKey!,
          this.workspaceDataPath!, // Is only called when the workspace is loaded
          this.telemetryService.withTracing(
            this.litellm('gemini-2.5-flash-lite'),
            {
              posthogProperties: {
                $ai_span_name: 'get-context-element-file',
              },
            },
          ),
          this.clientRuntime,
          (error) => {
            this.logger.error(
              `[AgentService] Failed to get context element file: ${error}`,
            );
          },
        );
        if (files.length === 0) return files;
        this.logger.debug(
          `[AgentService] Get context element files: ${files.map((file) => `${file.relativePath} - ${file.startLine} - ${file.endLine}`).join(', ')}`,
        );

        const fileContents = await Promise.all(
          files.map((file) =>
            this.clientRuntime.fileSystem.readFile(file.relativePath),
          ),
        );
        return fileContents.map((fileContent, index) => ({
          relativePath: files[index]!.relativePath,
          startLine: files[index]!.startLine,
          endLine: files[index]!.endLine,
          content: fileContent.content,
        }));
      },
    );
    // implement procedure handlers (such as 're-index codebase') here once needed
  }

  private removeServerProcedureHandlers() {
    this.kartonService.removeServerProcedureHandler(
      'agentChat.getContextElementFiles',
    );
  }

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
