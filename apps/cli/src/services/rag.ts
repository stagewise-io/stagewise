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
  private isIndexing = false;
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
      if (!draft.workspace?.agentChat) {
        draft.workspace!.agentChat = {
          chats: {},
          activeChatId: null,
          toolCallApprovalRequests: [],
          isWorking: false,
        };
      }
    });
  }

  private async updateRag(apiKey: string) {
    this.isIndexing = true;
    for await (const update of initializeRag(this.clientRuntime, apiKey))
      this.logger.debug(`updating rag: ${update.progress}/${update.total}`);
    this.isIndexing = false;
  }

  private async periodicallyUpdateRag(apiKey: string) {
    this.updateRagInterval = setInterval(async () => {
      if (this.isIndexing) {
        if (this.updateRagInterval) clearInterval(this.updateRagInterval);
        this.updateRagInterval = null;
        this.periodicallyUpdateRag(apiKey);
        return;
      }

      await this.updateRag(apiKey);
    }, 60 * 1000); // 1 Minute
    return () =>
      this.updateRagInterval && clearInterval(this.updateRagInterval);
  }

  public async initialize() {
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
  }

  private registerProcedureHandlers() {
    // TODO: implement the right procedure handlers
    // this.kartonService.registerServerProcedureHandler(
    //   'agentChat.undoToolCallsUntilUserMessage',
    //   async (userMessageId: string, chatId: string) => {},
    // );
  }

  private removeServerProcedureHandlers() {}

  // TODO: implement the right teardown
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
