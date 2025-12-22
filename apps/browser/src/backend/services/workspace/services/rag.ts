import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { KartonService } from '../../karton';
import type { Logger } from '../../logger';
import type { TelemetryService } from '../../telemetry';
import type { ReactSelectedElementInfo } from '@shared/context-elements/react';
import type { ContextElement } from '@shared/context-elements';
import { DisposableService } from '../../disposable';

export class RagService extends DisposableService {
  private readonly logger: Logger;
  private readonly uiKarton: KartonService;
  private readonly clientRuntime: ClientRuntime;
  private readonly telemetryService: TelemetryService;

  private constructor(
    logger: Logger,
    telemetryService: TelemetryService,
    uiKarton: KartonService,
    clientRuntime: ClientRuntime,
  ) {
    super();
    this.logger = logger;
    this.telemetryService = telemetryService;
    this.uiKarton = uiKarton;
    this.clientRuntime = clientRuntime;
  }

  public async initialize() {
    this.logger.debug('[RagService] Initializing...');
    this.registerProcedureHandlers();
  }

  private registerProcedureHandlers() {}

  private removeServerProcedureHandlers() {}

  private async getRelatedContextFilesForSelectedElement(
    element: ContextElement,
  ): Promise<ContextElement['codeMetadata']> {
    let codeMetadata: ContextElement['codeMetadata'] = [];

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
        codeMetadata?.map(async (entry) => {
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
        }) ?? [],
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
  protected onTeardown(): void {
    this.removeServerProcedureHandlers();
    this.cleanupPendingOperations('Rag teardown');
    this.logger.debug('[RagService] Teardown complete');
  }

  private async cleanupPendingOperations(reason?: string) {
    this.logger.debug('[RagService] Cleaning up pending operations', reason);
  }

  public static async create(
    logger: Logger,
    telemetryService: TelemetryService,
    uiKarton: KartonService,
    clientRuntime: ClientRuntime,
  ) {
    const instance = new RagService(
      logger,
      telemetryService,
      uiKarton,
      clientRuntime,
    );
    await instance.initialize();
    logger.debug('[RagService] Created service');
    return instance;
  }
}

const getFilePathsForReactComponentInfo = async (
  componentInfo: ReactSelectedElementInfo,
  clientRuntime: ClientRuntime,
): Promise<{
  codeMetadata: ContextElement['codeMetadata'];
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

  const results: ContextElement['codeMetadata'] = foundFiles.map((file) => {
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
