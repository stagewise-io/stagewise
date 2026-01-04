import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  createProtocolConnection,
  type ProtocolConnection,
  InitializeRequest,
  InitializedNotification,
  ShutdownRequest,
  ExitNotification,
  DidOpenTextDocumentNotification,
  DidCloseTextDocumentNotification,
  DidChangeTextDocumentNotification,
  PublishDiagnosticsNotification,
  HoverRequest,
  DefinitionRequest,
  ReferencesRequest,
  DocumentSymbolRequest,
  WorkspaceSymbolRequest,
  CodeActionRequest,
  CompletionRequest,
  type InitializeParams,
  type ServerCapabilities,
  type TextDocumentItem,
  type DidOpenTextDocumentParams,
  type DidCloseTextDocumentParams,
  type DidChangeTextDocumentParams,
  type HoverParams,
  type DefinitionParams,
  type ReferenceParams,
  type DocumentSymbolParams,
  type WorkspaceSymbolParams,
  type CodeActionParams,
  type CompletionParams,
} from 'vscode-languageserver-protocol/node';
import type {
  Diagnostic,
  Position,
  Location,
  LocationLink,
  DocumentSymbol,
  SymbolInformation,
  WorkspaceSymbol,
  Hover,
  CompletionItem,
  CodeAction,
} from 'vscode-languageserver-types';
import type { LspServerInfo } from './types';
import { getLanguageId } from './language-map';
import type { Logger } from '@/services/logger';

export interface LspClientEvents {
  diagnostics: (absoluteFilePath: string, diagnostics: Diagnostic[]) => void;
  error: (error: Error) => void;
  close: () => void;
}

export class LspClient extends EventEmitter {
  public readonly serverID: string;
  public readonly root: string;

  private static readonly DIAGNOSTICS_DEBOUNCE_MS = 150;
  private static readonly DIAGNOSTICS_TIMEOUT_MS = 3000;

  private connection: ProtocolConnection | null = null;
  private process: ChildProcessWithoutNullStreams | null = null;
  private capabilities: ServerCapabilities | null = null;
  private openDocuments = new Map<string, number>(); // uri -> version
  private diagnostics = new Map<string, Diagnostic[]>(); // absoluteFilePath -> diagnostics
  private diagnosticsHash = new Map<string, string>(); // absoluteFilePath -> hash for deduplication
  private initializePromise: Promise<void> | null = null;
  private initializationOptions: Record<string, unknown> | undefined;
  private disposed = false;

  /**
   * Compute a simple hash of diagnostics for deduplication
   */
  private computeDiagnosticsHash(diagnostics: Diagnostic[]): string {
    // Create a stable string representation for comparison
    return diagnostics
      .map(
        (d) =>
          `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character}|${d.message}|${d.code ?? ''}`,
      )
      .sort()
      .join(';;');
  }

  /**
   * Update diagnostics and emit event only if they changed
   */
  private updateDiagnostics(
    filePath: string,
    newDiagnostics: Diagnostic[],
  ): void {
    const newHash = this.computeDiagnosticsHash(newDiagnostics);
    const oldHash = this.diagnosticsHash.get(filePath);

    // Only emit if diagnostics actually changed
    if (newHash !== oldHash) {
      this.diagnostics.set(filePath, newDiagnostics);
      this.diagnosticsHash.set(filePath, newHash);
      this.emit('diagnostics', filePath, newDiagnostics);
    }
  }

  private constructor(
    private readonly serverInfo: LspServerInfo,
    private readonly logger: Logger,
    root: string,
  ) {
    super();
    this.serverID = serverInfo.id;
    this.root = root;
  }

  /**
   * Create and initialize an LSP client for the given server and root
   */
  public static async create(
    serverInfo: LspServerInfo,
    logger: Logger,
    root: string,
  ): Promise<LspClient | undefined> {
    const client = new LspClient(serverInfo, logger, root);
    const success = await client.start();
    if (!success) {
      return undefined;
    }
    return client;
  }

  /**
   * Start the LSP server process and initialize the connection
   */
  private async start(): Promise<boolean> {
    try {
      const handle = await this.serverInfo.spawn(this.root);
      if (!handle) {
        this.logger.debug(
          `[LspClient:${this.serverID}] Failed to spawn server for root: ${this.root}`,
        );
        return false;
      }

      this.process = handle.process;
      this.initializationOptions = handle.initializationOptions;
      this.connection = createProtocolConnection(
        this.process.stdout,
        this.process.stdin,
      );

      this.setupHandlers();
      this.connection.listen();

      await this.initialize(this.initializationOptions);
      this.logger.debug(
        `[LspClient:${this.serverID}] Server started for root: ${this.root}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `[LspClient:${this.serverID}] Failed to start server:`,
        error,
      );
      this.emit('error', error);
      return false;
    }
  }

  private setupHandlers(): void {
    if (!this.connection || !this.process) return;

    // Handle diagnostics notifications (push diagnostics from server)
    this.connection.onNotification(
      PublishDiagnosticsNotification.type,
      (params) => {
        const filePath = fileURLToPath(params.uri);
        this.updateDiagnostics(filePath, params.diagnostics);
      },
    );

    // Handle workspace/configuration request (required by ESLint)
    // ESLint server requests configuration for sections like "eslint"
    // We need to return the EXACT settings format VS Code uses
    this.connection.onRequest(
      'workspace/configuration',
      async (params: {
        items: Array<{ scopeUri?: string; section?: string }>;
      }) => {
        // Build the response - ensure workspaceFolder is always included
        return params.items.map(() => {
          // Start with initializationOptions
          const config = { ...(this.initializationOptions ?? {}) };

          // Ensure workspaceFolder is set (CRITICAL for ESLint)
          if (!config.workspaceFolder) {
            config.workspaceFolder = {
              name: this.root.split('/').pop() || 'workspace',
              uri: pathToFileURL(this.root).toString(),
            };
          }

          return config;
        });
      },
    );

    // Handle workspace/workspaceFolders request
    this.connection.onRequest('workspace/workspaceFolders', async () => [
      {
        name: this.root.split('/').pop() || 'workspace',
        uri: pathToFileURL(this.root).toString(),
      },
    ]);

    // Handle dynamic capability registration (no-op, but must respond)
    this.connection.onRequest('client/registerCapability', async () => {});
    this.connection.onRequest('client/unregisterCapability', async () => {});

    // Handle progress creation (acknowledge but don't track)
    this.connection.onRequest('window/workDoneProgress/create', () => null);

    // Handle process exit
    this.process.on('exit', (code) => {
      this.logger.debug(
        `[LspClient:${this.serverID}] Process exited with code: ${code}`,
      );
      this.emit('close');
    });

    this.process.on('error', (error) => {
      this.logger.error(`[LspClient:${this.serverID}] Process error:`, error);
      this.emit('error', error);
    });

    // Log stderr for debugging
    this.process.stderr.on('data', (data) => {
      this.logger.debug(`[LspClient:${this.serverID}] stderr: ${data}`);
    });

    // Handle $/progress notifications (ESLint sends validation progress here)
    this.connection.onNotification(
      '$/progress',
      (_params: { token: string | number; value: unknown }) => {
        // Progress notifications acknowledged but not tracked
      },
    );

    // Handle window/logMessage (ESLint logs messages here)
    this.connection.onNotification(
      'window/logMessage',
      (_params: { type: number; message: string }) => {
        // Log messages from server acknowledged but not displayed
      },
    );

    // Handle workspace/diagnostic/refresh (ESLint sends this when settings change)
    // Server is telling us to re-pull diagnostics for all open documents
    this.connection.onNotification('workspace/diagnostic/refresh', () => {
      this.refreshAllDiagnostics();
    });
  }

  /**
   * Re-pull diagnostics for all open documents.
   * Called when server sends workspace/diagnostic/refresh notification.
   */
  private refreshAllDiagnostics(): void {
    if (
      !this.connection ||
      this.disposed ||
      !(this.capabilities as Record<string, unknown>)?.diagnosticProvider
    ) {
      return;
    }

    for (const [uri, _version] of this.openDocuments) {
      const filePath = fileURLToPath(uri);

      const requestPullDiagnostics = async () => {
        if (!this.connection || this.disposed) return;

        try {
          const diagResult = await this.connection.sendRequest(
            'textDocument/diagnostic',
            { textDocument: { uri } },
          );
          const items = (diagResult as { items?: Diagnostic[] })?.items ?? [];
          this.updateDiagnostics(filePath, items);
        } catch (error) {
          this.logger.debug(
            `[LspClient:${this.serverID}] Pull diagnostics failed during refresh for ${filePath}:`,
            error,
          );
        }
      };

      // Small delay to avoid overwhelming the server
      requestPullDiagnostics().catch(() => {});
    }
  }

  private async initialize(
    initializationOptions?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.connection) {
      throw new Error('Connection not established');
    }

    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = (async () => {
      const params: InitializeParams = {
        processId: process.pid,
        rootUri: pathToFileURL(this.root).toString(),
        rootPath: this.root,
        capabilities: {
          textDocument: {
            synchronization: {
              didSave: true,
              willSave: false,
              willSaveWaitUntil: false,
            },
            publishDiagnostics: {
              relatedInformation: true,
              versionSupport: true,
              codeDescriptionSupport: true,
              dataSupport: true,
            },
            hover: {
              contentFormat: ['markdown', 'plaintext'],
            },
            completion: {
              completionItem: {
                snippetSupport: true,
                documentationFormat: ['markdown', 'plaintext'],
              },
            },
            definition: {
              linkSupport: true,
            },
            references: {},
            documentSymbol: {
              hierarchicalDocumentSymbolSupport: true,
            },
            codeAction: {
              codeActionLiteralSupport: {
                codeActionKind: {
                  valueSet: [
                    'quickfix',
                    'refactor',
                    'refactor.extract',
                    'refactor.inline',
                    'refactor.rewrite',
                    'source',
                    'source.organizeImports',
                    'source.fixAll',
                  ],
                },
              },
            },
          },
          workspace: {
            workspaceFolders: true,
            configuration: true,
            didChangeConfiguration: {
              dynamicRegistration: false,
            },
          },
        },
        initializationOptions,
        workspaceFolders: [
          {
            uri: pathToFileURL(this.root).toString(),
            name: this.root.split('/').pop() || 'workspace',
          },
        ],
      };

      const result = await this.connection!.sendRequest(
        InitializeRequest.type,
        params,
      );

      this.capabilities = result.capabilities;

      // Send initialized notification
      await this.connection!.sendNotification(InitializedNotification.type, {});

      // Send workspace/didChangeConfiguration to push settings to the server
      // This is required by some servers like ESLint to start linting
      if (initializationOptions) {
        await this.connection!.sendNotification(
          'workspace/didChangeConfiguration',
          {
            settings: initializationOptions,
          },
        );
      }
    })();

    return this.initializePromise;
  }

  /**
   * Open a document in the LSP server
   */
  public async openDocument(filePath: string): Promise<void> {
    if (!this.connection || this.disposed) return;

    const uri = pathToFileURL(filePath).toString();

    // Already open, skip
    if (this.openDocuments.has(uri)) return;

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const languageId = getLanguageId(filePath);

      const textDocument: TextDocumentItem = {
        uri,
        languageId,
        version: 1,
        text: content,
      };

      this.openDocuments.set(uri, 1);
      const params: DidOpenTextDocumentParams = { textDocument };
      await this.connection.sendNotification(
        DidOpenTextDocumentNotification.type,
        params,
      );

      // ESLint's run: "onType" setting responds to changes, not just opens
      // Send a no-op change to trigger validation
      const changeParams: DidChangeTextDocumentParams = {
        textDocument: {
          uri,
          version: 2,
        },
        contentChanges: [{ text: content }],
      };
      this.openDocuments.set(uri, 2);
      await this.connection.sendNotification(
        DidChangeTextDocumentNotification.type,
        changeParams,
      );

      // If server supports pull diagnostics (diagnosticProvider), request diagnostics
      // ESLint uses pull diagnostics - we need to explicitly request them
      if (
        (this.capabilities as Record<string, unknown>)?.diagnosticProvider &&
        this.connection
      ) {
        const requestPullDiagnostics = async (delay: number) => {
          if (!this.connection || this.disposed) return;
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (!this.connection || this.disposed) return;

          try {
            const diagResult = await this.connection.sendRequest(
              'textDocument/diagnostic',
              {
                textDocument: { uri },
              },
            );
            // Process pull diagnostics result (deduplication handled by updateDiagnostics)
            const items = (diagResult as { items?: Diagnostic[] })?.items ?? [];
            if (items.length > 0) {
              this.updateDiagnostics(filePath, items);
            }
          } catch (pullError) {
            // Server may not support pull diagnostics despite advertising
            this.logger.debug(
              `[LspClient:${this.serverID}] Pull diagnostics failed for ${filePath}:`,
              pullError,
            );
          }
        };
        // Request pull diagnostics after delays to give ESLint time to validate
        requestPullDiagnostics(500).catch(() => {});
        requestPullDiagnostics(2000).catch(() => {});
        requestPullDiagnostics(5000).catch(() => {});
      }
    } catch (error) {
      this.logger.error(
        `[LspClient:${this.serverID}] Failed to open document: ${filePath}`,
        error,
      );
    }
  }

  /**
   * Notify the server of document changes
   */
  public async updateDocument(
    filePath: string,
    content: string,
  ): Promise<void> {
    if (!this.connection || this.disposed) return;

    const uri = pathToFileURL(filePath).toString();
    const currentVersion = this.openDocuments.get(uri);

    if (currentVersion === undefined) {
      // Document not open, open it instead
      await this.openDocument(filePath);
      return;
    }

    const newVersion = currentVersion + 1;
    this.openDocuments.set(uri, newVersion);

    const params: DidChangeTextDocumentParams = {
      textDocument: {
        uri,
        version: newVersion,
      },
      contentChanges: [{ text: content }],
    };
    await this.connection.sendNotification(
      DidChangeTextDocumentNotification.type,
      params,
    );

    // Request pull diagnostics after update for servers that use pull model (e.g., ESLint)
    // Without this, servers with diagnosticProvider won't re-validate after content changes
    if (
      (this.capabilities as Record<string, unknown>)?.diagnosticProvider &&
      this.connection
    ) {
      const requestPullDiagnostics = async (delay: number) => {
        if (!this.connection || this.disposed) return;
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (!this.connection || this.disposed) return;

        try {
          const diagResult = await this.connection.sendRequest(
            'textDocument/diagnostic',
            {
              textDocument: { uri },
            },
          );
          const items = (diagResult as { items?: Diagnostic[] })?.items ?? [];
          // Always update diagnostics (even if empty) to clear stale ones
          this.updateDiagnostics(filePath, items);
        } catch (pullError) {
          this.logger.debug(
            `[LspClient:${this.serverID}] Pull diagnostics failed after update for ${filePath}:`,
            pullError,
          );
        }
      };
      // Request pull diagnostics with delays to give the server time to process the change
      requestPullDiagnostics(100).catch(() => {});
      requestPullDiagnostics(500).catch(() => {});
    }
  }

  /**
   * Close a document
   */
  public async closeDocument(filePath: string): Promise<void> {
    if (!this.connection || this.disposed) return;

    const uri = pathToFileURL(filePath).toString();

    if (!this.openDocuments.has(uri)) return;

    this.openDocuments.delete(uri);
    this.diagnostics.delete(filePath);
    this.diagnosticsHash.delete(filePath);

    const params: DidCloseTextDocumentParams = {
      textDocument: { uri },
    };
    await this.connection.sendNotification(
      DidCloseTextDocumentNotification.type,
      params,
    );
  }

  /**
   * Wait for diagnostics to be received for a file.
   * Uses debouncing to handle multiple rapid diagnostic updates.
   */
  public async waitForDiagnostics(filePath: string): Promise<void> {
    return new Promise((resolve) => {
      let debounceTimer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = (timer: ReturnType<typeof setTimeout>) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        clearTimeout(timer);
        this.off('diagnostics', onDiagnostics);
      };

      const onDiagnostics = (path: string) => {
        if (path !== filePath) return;

        // Debounce to allow follow-up diagnostics (syntax errors first, then semantic)
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          cleanup(timeoutTimer);
          resolve();
        }, LspClient.DIAGNOSTICS_DEBOUNCE_MS);
      };

      // Subscribe to diagnostics events
      this.on('diagnostics', onDiagnostics);

      // Overall timeout - resolve anyway to avoid hanging
      const timeoutTimer = setTimeout(() => {
        cleanup(timeoutTimer);
        resolve();
      }, LspClient.DIAGNOSTICS_TIMEOUT_MS);
    });
  }

  /**
   * Get diagnostics for a file
   */
  public getDiagnostics(filePath: string): Diagnostic[] {
    return this.diagnostics.get(filePath) ?? [];
  }

  /**
   * Get all diagnostics from this server
   */
  public getAllDiagnostics(): Map<string, Diagnostic[]> {
    return new Map(this.diagnostics);
  }

  /**
   * Request hover information
   */
  public async hover(
    filePath: string,
    position: Position,
  ): Promise<Hover | null> {
    if (
      !this.connection ||
      this.disposed ||
      !this.capabilities?.hoverProvider
    ) {
      return null;
    }

    const params: HoverParams = {
      textDocument: { uri: pathToFileURL(filePath).toString() },
      position,
    };

    try {
      return await this.connection.sendRequest(HoverRequest.type, params);
    } catch (error) {
      this.logger.error(
        `[LspClient:${this.serverID}] Hover request failed:`,
        error,
      );
      return null;
    }
  }

  /**
   * Request go-to-definition
   */
  public async definition(
    filePath: string,
    position: Position,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    if (
      !this.connection ||
      this.disposed ||
      !this.capabilities?.definitionProvider
    ) {
      return null;
    }

    const params: DefinitionParams = {
      textDocument: { uri: pathToFileURL(filePath).toString() },
      position,
    };

    try {
      return await this.connection.sendRequest(DefinitionRequest.type, params);
    } catch (error) {
      this.logger.error(
        `[LspClient:${this.serverID}] Definition request failed:`,
        error,
      );
      return null;
    }
  }

  /**
   * Request references
   */
  public async references(
    filePath: string,
    position: Position,
  ): Promise<Location[] | null> {
    if (
      !this.connection ||
      this.disposed ||
      !this.capabilities?.referencesProvider
    ) {
      return null;
    }

    const params: ReferenceParams = {
      textDocument: { uri: pathToFileURL(filePath).toString() },
      position,
      context: { includeDeclaration: true },
    };

    try {
      return await this.connection.sendRequest(ReferencesRequest.type, params);
    } catch (error) {
      this.logger.error(
        `[LspClient:${this.serverID}] References request failed:`,
        error,
      );
      return null;
    }
  }

  /**
   * Request document symbols
   */
  public async documentSymbol(
    filePath: string,
  ): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    if (
      !this.connection ||
      this.disposed ||
      !this.capabilities?.documentSymbolProvider
    ) {
      return null;
    }

    const params: DocumentSymbolParams = {
      textDocument: { uri: pathToFileURL(filePath).toString() },
    };

    try {
      return await this.connection.sendRequest(
        DocumentSymbolRequest.type,
        params,
      );
    } catch (error) {
      this.logger.error(
        `[LspClient:${this.serverID}] DocumentSymbol request failed:`,
        error,
      );
      return null;
    }
  }

  /**
   * Request workspace symbols
   */
  public async workspaceSymbol(
    query: string,
  ): Promise<SymbolInformation[] | WorkspaceSymbol[] | null> {
    if (
      !this.connection ||
      this.disposed ||
      !this.capabilities?.workspaceSymbolProvider
    ) {
      return null;
    }

    const params: WorkspaceSymbolParams = { query };

    try {
      return await this.connection.sendRequest(
        WorkspaceSymbolRequest.type,
        params,
      );
    } catch (error) {
      this.logger.error(
        `[LspClient:${this.serverID}] WorkspaceSymbol request failed:`,
        error,
      );
      return null;
    }
  }

  /**
   * Request code actions
   */
  public async codeAction(
    filePath: string,
    range: { start: Position; end: Position },
    diagnostics?: Diagnostic[],
  ): Promise<CodeAction[] | null> {
    if (
      !this.connection ||
      this.disposed ||
      !this.capabilities?.codeActionProvider
    ) {
      return null;
    }

    const params: CodeActionParams = {
      textDocument: { uri: pathToFileURL(filePath).toString() },
      range,
      context: {
        diagnostics: diagnostics ?? this.getDiagnostics(filePath),
      },
    };

    try {
      const result = await this.connection.sendRequest(
        CodeActionRequest.type,
        params,
      );
      // Filter out Command responses, keep only CodeAction objects
      return (
        result?.filter(
          (item): item is CodeAction => 'edit' in item || 'command' in item,
        ) ?? null
      );
    } catch (error) {
      this.logger.error(
        `[LspClient:${this.serverID}] CodeAction request failed:`,
        error,
      );
      return null;
    }
  }

  /**
   * Request completions
   */
  public async completion(
    filePath: string,
    position: Position,
  ): Promise<CompletionItem[] | null> {
    if (
      !this.connection ||
      this.disposed ||
      !this.capabilities?.completionProvider
    ) {
      return null;
    }

    const params: CompletionParams = {
      textDocument: { uri: pathToFileURL(filePath).toString() },
      position,
    };

    try {
      const result = await this.connection.sendRequest(
        CompletionRequest.type,
        params,
      );
      // Result can be CompletionItem[] or CompletionList
      if (Array.isArray(result)) {
        return result;
      }
      return result?.items ?? null;
    } catch (error) {
      this.logger.error(
        `[LspClient:${this.serverID}] Completion request failed:`,
        error,
      );
      return null;
    }
  }

  /**
   * Check if this client handles the given file extension
   */
  public handlesExtension(ext: string): boolean {
    return this.serverInfo.extensions.includes(ext);
  }

  /**
   * Get server capabilities
   */
  public getCapabilities(): ServerCapabilities | null {
    return this.capabilities;
  }

  /**
   * Get the underlying ProtocolConnection for direct protocol access.
   * Use this for LSP operations not covered by wrapper methods.
   */
  public getConnection(): ProtocolConnection | null {
    return this.connection;
  }

  /**
   * Check if the server is running
   */
  public isRunning(): boolean {
    return this.connection !== null && !this.disposed;
  }

  /**
   * Dispose of the client and shut down the server
   */
  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    if (this.connection) {
      try {
        // Send shutdown request
        await this.connection.sendRequest(ShutdownRequest.type);
        // Send exit notification
        await this.connection.sendNotification(ExitNotification.type);
      } catch {
        // Server may have already exited
      }
      this.connection.dispose();
      this.connection = null;
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.openDocuments.clear();
    this.diagnostics.clear();
    this.diagnosticsHash.clear();
    this.removeAllListeners();

    this.logger.debug(`[LspClient:${this.serverID}] Disposed`);
  }
}
