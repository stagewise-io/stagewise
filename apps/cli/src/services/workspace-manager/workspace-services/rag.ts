import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { initializeRag, getRagMetadata } from '@stagewise/agent-rag';
import { isAuthenticationError } from '@stagewise/agent-utils';
import type { KartonService } from '../../karton';
import type { Logger } from '../../logger';
import type { TelemetryService } from '../../telemetry';
import type { AuthService } from '../../auth';
import type {
  ReactSelectedElementInfo,
  SelectedElement,
} from '@stagewise/karton-contract';
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
          if (isAuthenticationError(error)) throw error;

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
      } else {
        this.resetRagStatusWithError(
          "Failed to update the codebase index - we'll try again later.",
        );
      }
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

      // Immediately run RAG update on creation // TODO: Enable again when needed
      // void this.updateRag();

      // Then periodically update RAG // TODO: Enable again when needed
      // this.periodicallyUpdateRag();

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
      'agentChat.enrichSelectedElement',
      async (element) => {
        const codeMetadata =
          await this.getRelatedContextFilesForSelectedElement(element);

        // If the utility returned info for react, we filter the component name tree to only include the components that were found in the code base

        return { ...element, codeMetadata };
      },
    );
    // implement procedure handlers (such as 're-index codebase') here once needed
  }

  private removeServerProcedureHandlers() {
    this.kartonService.removeServerProcedureHandler(
      'agentChat.enrichSelectedElement',
    );
  }

  private async getRelatedContextFilesForSelectedElement(
    element: SelectedElement,
  ): Promise<SelectedElement['codeMetadata']> {
    let codeMetadata: SelectedElement['codeMetadata'] = [];

    // We check if framework-specific info exists that may help us. If yes, we can statically infer fitting files and line numbers.
    if (element.frameworkInfo?.react) {
      this.logger.debug(
        '[RagService] Getting context files for selected react component',
      );
      const results = await getFilePathsForReactComponentInfo(
        element.frameworkInfo.react,
        this.clientRuntime,
      );

      codeMetadata = results.codeMetadata;

      // Extend codeMetadata with file content
      codeMetadata = await Promise.all(
        codeMetadata.map(async (entry) => {
          return {
            ...entry,
            content: await this.clientRuntime.fileSystem
              .readFile(entry.relativePath)
              .then((result) =>
                result.success
                  ? (result.content ?? '[FILE_CONTENT_UNAVAILABLE]')
                  : '[FILE_CONTENT_UNAVAILABLE]',
              )
              .catch(() => '[FILE_CONTENT_UNAVAILABLE]'),
          };
        }),
      );

      this.logger.debug(
        `[RagService] Found react component context files: ${JSON.stringify(
          codeMetadata.map((entry) => entry.relativePath),
          null,
          2,
        )}`,
      );

      // We don't need additional files if we have at least 2 covered levels of information about the component structure
      if (results.coveredLevels >= 2) return codeMetadata;

      this.logger.debug(
        '[RagService] No context files found for selected react component',
      );
    } else {
      // TODO: Implement other framework-specific retrieval logic here, fall back to RAG when RAG is enabled again
    }

    return codeMetadata;
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

const getFilePathsForReactComponentInfo = async (
  componentInfo: ReactSelectedElementInfo,
  clientRuntime: ClientRuntime,
): Promise<{
  codeMetadata: SelectedElement['codeMetadata'];
  coveredLevels: number;
}> => {
  const componentNames: string[] = [];
  let currentComponent = componentInfo;
  while (currentComponent && componentNames.length < 20) {
    componentNames.push(currentComponent.componentName);
    currentComponent = currentComponent.parent ?? null;
  }

  // For every component name, we now collect the grep results
  const rgResults = await Promise.all(
    componentNames.map(async (componentName) => {
      return await clientRuntime.fileSystem.grep(
        '.',
        `\\b(?:function\\s+${componentName}\\b|(?:const|let|var)\\s+${componentName}\\s*=\\s*(?:async\\s*)?\\(.*\\)\\s*=>|${componentName}\\s*:\\s*(?:async\\s*)?\\(.*\\)\\s*=>)`,
        {
          recursive: true,
          filePattern: `*.tsx`,
          respectGitignore: true,
          maxMatches: 3,
        },
      );
    }),
  );

  // Stores the amount of found files for every components level (index 0 = first component name)
  const coveredLevels: number[] = rgResults.map((result) =>
    result.success ? (result.totalMatches ?? 0) : 0,
  );

  const foundFiles: { path: string; relationGrades: number[] }[] =
    rgResults.reduce<{ path: string; relationGrades: number[] }[]>(
      (curr, acc, index) => {
        // Iterate over every match and add the path to the current object. If the object already exists, we add the relation grade to the existing object. If the relation grade also already exists, we do nothing.
        if (!acc.success) return curr;
        if (!acc.matches || acc.matches.length === 0) return curr;

        acc.matches.forEach((match) => {
          const existingFile = curr.find(
            (file) => file.path === match.relativePath,
          );
          if (existingFile) {
            const existingIndex = existingFile.relationGrades.indexOf(index);
            if (existingIndex !== -1) return;
            existingFile.relationGrades.push(index);
          } else {
            curr.push({ path: match.relativePath, relationGrades: [index] });
          }
        });
        return curr;
      },
      [],
    );

  const results: SelectedElement['codeMetadata'] = foundFiles.map((file) => {
    const relationTextParts = file.relationGrades.map((grade, index) => {
      return `${coveredLevels[grade]! > 1 && grade === 0 ? 'potentially ' : ''}${index === 0 ? 'contains' : ''} ${grade === 0 ? 'implementation' : `${grade}${grade === 1 ? 'st' : grade === 2 ? 'nd' : grade === 3 ? 'rd' : 'th'} grade${index === (file.relationGrades.length - 1) ? ' parent' : ''}`}`;
    });

    // Join all parts with "," unless the last part which should be joined with "and"
    const relationText = `${
      relationTextParts.length > 1
        ? relationTextParts.slice(0, -1).join(', ') +
          ' and ' +
          relationTextParts[relationTextParts.length - 1]
        : relationTextParts[0]
    } of component`;

    return {
      relativePath: file.path,
      startLine: 0,
      content: '',
      relation: relationText,
    };
  });

  return {
    codeMetadata: results,
    coveredLevels: coveredLevels.filter((l) => l > 0).length,
  };
};
