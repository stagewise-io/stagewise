import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { getBaseName } from '@shared/path-utils';
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
  /**
   * Default safety-net cap for `waitForDiagnostics`. Individual servers can
   * override it via `LspServerInfo.diagnosticsTimeoutMs` (e.g. rust-analyzer,
   * whose cargo-backed flycheck is slower than this default on a cold cache).
   */
  private static readonly DIAGNOSTICS_TIMEOUT_MS = 3000;
  private static readonly CLIENT_INIT_TIMEOUT_MS = 15_000;
  private static readonly SHUTDOWN_TIMEOUT_MS = 5_000;

  private connection: ProtocolConnection | null = null;
  private process: ChildProcessWithoutNullStreams | null = null;
  private capabilities: ServerCapabilities | null = null;
  private openDocuments = new Map<string, number>(); // uri -> version
  private diagnostics = new Map<string, Diagnostic[]>(); // absoluteFilePath -> diagnostics
  private diagnosticsHash = new Map<string, string>(); // absoluteFilePath -> hash for deduplication
  private lastDiagnosticsVersion = new Map<string, number>(); // absoluteFilePath -> last published document version
  private sentContentHash = new Map<string, string>(); // uri -> hash of the last content sent to the server
  private initializePromise: Promise<void> | null = null;
  private initializationOptions: Record<string, unknown> | undefined;
  private disposed = false;
  private disposePromise: Promise<void> | null = null;

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
   * Compute a hash of file content for change detection between re-lints.
   */
  private computeContentHash(content: string): string {
    return createHash('sha1').update(content).digest('hex');
  }

  /**
   * Update diagnostics and emit event only if they changed
   */
  private updateDiagnostics(
    filePath: string,
    newDiagnostics: Diagnostic[],
    version?: number,
  ): void {
    const newHash = this.computeDiagnosticsHash(newDiagnostics);
    const oldHash = this.diagnosticsHash.get(filePath);

    // Only emit the (deduped) 'diagnostics' change event if the set actually
    // changed — downstream consumers use it for change propagation.
    if (newHash !== oldHash) {
      this.diagnostics.set(filePath, newDiagnostics);
      this.diagnosticsHash.set(filePath, newHash);
      this.emit('diagnostics', filePath, newDiagnostics);
    }

    // Track the document version these diagnostics were computed against, when
    // the server reports it (clangd and rust-analyzer both do). waitForDiagnostics
    // uses this to ignore stale publishes from an earlier analysis.
    if (typeof version === 'number') {
      this.lastDiagnosticsVersion.set(filePath, version);
    }

    // Always signal that the server delivered a fresh diagnostic set for this
    // file, even when the content was identical and the change event above was
    // suppressed by dedup. waitForDiagnostics relies on this receipt (paired
    // with the version) so it can resolve on an actual server response rather
    // than guessing with a timer.
    this.emit('diagnosticsReceived', filePath, version);
  }

  private readonly resolvedEnv: Record<string, string> | null;

  private constructor(
    private readonly serverInfo: LspServerInfo,
    private readonly logger: Logger,
    root: string,
    resolvedEnv?: Record<string, string> | null,
  ) {
    super();
    this.serverID = serverInfo.id;
    this.root = root;
    this.resolvedEnv = resolvedEnv ?? null;
  }

  /**
   * Create and initialize an LSP client for the given server and root
   */
  public static async create(
    serverInfo: LspServerInfo,
    logger: Logger,
    root: string,
    resolvedEnv?: Record<string, string> | null,
  ): Promise<LspClient | undefined> {
    const client = new LspClient(serverInfo, logger, root, resolvedEnv);
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
      const result = await Promise.race([
        this.startInternal(),
        new Promise<'timeout'>((resolve) =>
          setTimeout(
            () => resolve('timeout'),
            LspClient.CLIENT_INIT_TIMEOUT_MS,
          ),
        ),
      ]);
      if (result === 'timeout') {
        this.logger.warn(
          `[LspClient:${this.serverID}] Initialization timed out after ${LspClient.CLIENT_INIT_TIMEOUT_MS}ms`,
        );
        if (this.process) {
          this.process.kill();
          this.process = null;
        }
        if (this.connection) {
          this.connection.dispose();
          this.connection = null;
        }
        return false;
      }
      return result;
    } catch (error) {
      this.logger.error(
        `[LspClient:${this.serverID}] Failed to start server:`,
        error,
      );
      this.emit('error', error);
      return false;
    }
  }

  private async startInternal(): Promise<boolean> {
    const handle = await this.serverInfo.spawn(this.root, this.resolvedEnv);
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

    try {
      await this.initialize(this.initializationOptions);
    } catch (error) {
      // Process may have died (ENOENT, crash) before initialize completed.
      // setupHandlers already marked us as disposed — just bail out.
      this.logger.warn(
        `[LspClient:${this.serverID}] Initialize failed (process likely dead):`,
        error,
      );
      this.disposed = true;
      this.connection?.dispose();
      this.connection = null;
      if (this.process) {
        this.process.kill();
        this.process = null;
      }
      return false;
    }

    this.logger.debug(
      `[LspClient:${this.serverID}] Server started for root: ${this.root}`,
    );
    return true;
  }

  private setupHandlers(): void {
    if (!this.connection || !this.process) return;

    // Handle diagnostics notifications (push diagnostics from server)
    this.connection.onNotification(
      PublishDiagnosticsNotification.type,
      (params) => {
        const filePath = fileURLToPath(params.uri);
        this.updateDiagnostics(filePath, params.diagnostics, params.version);
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
              name: getBaseName(this.root) || 'workspace',
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

    // Handle process exit — defer full cleanup to dispose() (idempotent,
    // single-flight) so we never race against an in-flight dispose().
    // Do NOT null `this.process` or emit 'close' here: dispose() snapshots
    // the handle atomically and emits 'close' at the end of performDispose
    // so observers see the client in its final state. `kill()` on an
    // already-exited process is a no-op, so leaving the handle in place
    // is safe.
    this.process.on('exit', (code) => {
      this.logger.debug(
        `[LspClient:${this.serverID}] Process exited with code: ${code}`,
      );
      this.dispose().catch((err) => {
        this.logger.debug(
          `[LspClient:${this.serverID}] dispose() after process exit failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    });

    // Do NOT null `this.process` here: on 'error' the process is typically
    // still alive, and dispose() needs the handle to kill it.
    this.process.on('error', (error) => {
      this.logger.error(`[LspClient:${this.serverID}] Process error:`, error);
      this.emit('error', error);
      this.dispose().catch((err) => {
        this.logger.debug(
          `[LspClient:${this.serverID}] dispose() after process error failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
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

    for (const uri of this.openDocuments.keys()) {
      const filePath = fileURLToPath(uri);
      // Re-pull through the shared helper: it snapshots and tags the current
      // document version, so a refresh racing a concurrent change cannot emit a
      // version-less receipt that resolves a wait with stale data.
      this.schedulePullDiagnostics(uri, filePath, [0]);
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
            name: getBaseName(this.root) || 'workspace',
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
   * Request pull diagnostics (`textDocument/diagnostic`) for a pull-model
   * server (one advertising `diagnosticProvider`, e.g. ESLint) and feed the
   * result through updateDiagnostics. Several delayed attempts give the server
   * time to validate after an open/change.
   *
   * Each result is tagged with the document version current at send time. The
   * server processes messages in order, so the response reflects at least that
   * version; a pull issued before a newer change is therefore tagged with the
   * older version and gated out by waitForDiagnostics instead of resolving a
   * wait with stale data.
   */
  private schedulePullDiagnostics(
    uri: string,
    filePath: string,
    delays: number[],
  ): void {
    if (!(this.capabilities as Record<string, unknown>)?.diagnosticProvider) {
      return;
    }
    for (const delay of delays) {
      void (async () => {
        if (this.disposed) return;
        await new Promise((resolve) => setTimeout(resolve, delay));
        // Snapshot the connection after the timeout so dispose() nulling
        // `this.connection` mid-flight cannot cause a null-deref here.
        const conn = this.connection;
        if (!conn || this.disposed) return;
        // Read the document version at send time (see method doc).
        const version = this.openDocuments.get(uri);
        try {
          const diagResult = await conn.sendRequest('textDocument/diagnostic', {
            textDocument: { uri },
          });
          if (this.disposed) return;
          const items = (diagResult as { items?: Diagnostic[] })?.items ?? [];
          // Always update (even when empty) to clear stale diagnostics and emit
          // a receipt so a clean file's wait resolves promptly.
          this.updateDiagnostics(filePath, items, version);
        } catch (pullError) {
          // Server may not support pull diagnostics despite advertising, or
          // dispose() may have torn the connection down between the timeout and
          // the sendRequest resolving.
          this.logger.debug(
            `[LspClient:${this.serverID}] Pull diagnostics failed for ${filePath}:`,
            pullError,
          );
        }
      })();
    }
  }

  /**
   * Open a document in the LSP server
   */
  public async openDocument(filePath: string): Promise<number | undefined> {
    if (!this.connection || this.disposed) return undefined;

    const uri = pathToFileURL(filePath).toString();

    // Already open — re-read from disk and send a change notification so
    // the server re-analyzes with the latest content.
    if (this.openDocuments.has(uri)) {
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        // Snapshot the connection after the readFile await so a concurrent
        // dispose() (which synchronously nulls `this.connection`) cannot
        // cause a null-deref on the sendNotification below.
        const conn = this.connection;
        if (!conn || this.disposed) return undefined;
        const currentVersion = this.openDocuments.get(uri)!;
        const newVersion = currentVersion + 1;
        this.openDocuments.set(uri, newVersion);
        const contentHash = this.computeContentHash(content);
        const contentChanged = this.sentContentHash.get(uri) !== contentHash;
        this.sentContentHash.set(uri, contentHash);
        await conn.sendNotification(DidChangeTextDocumentNotification.type, {
          textDocument: { uri, version: newVersion },
          contentChanges: [{ text: content }],
        });
        // Pull-model servers don't push on didChange — request a refresh when
        // the content actually changed so new diagnostics are produced (and
        // tagged with the new version).
        if (contentChanged) {
          this.schedulePullDiagnostics(uri, filePath, [100, 500]);
        }
        // If the on-disk content is unchanged, the server may not re-publish
        // (clangd, for one, skips identical re-analyses) and the cached
        // diagnostics are already current — so wait against the last published
        // version, which the fast path in waitForDiagnostics satisfies
        // immediately. Only when the content actually changed do we wait for a
        // publish at the new version.
        return contentChanged
          ? newVersion
          : this.lastDiagnosticsVersion.get(filePath);
      } catch {
        // File may have been deleted between open and re-read, or the
        // connection was disposed while we were reading.
        return undefined;
      }
    }

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      // Snapshot the connection after the readFile await so a concurrent
      // dispose() (which synchronously nulls `this.connection`) cannot
      // cause a null-deref on the sendNotification calls below.
      const conn = this.connection;
      if (!conn || this.disposed) return undefined;
      const languageId = getLanguageId(filePath);
      this.sentContentHash.set(uri, this.computeContentHash(content));

      const textDocument: TextDocumentItem = {
        uri,
        languageId,
        version: 1,
        text: content,
      };

      this.openDocuments.set(uri, 1);
      const params: DidOpenTextDocumentParams = { textDocument };
      await conn.sendNotification(DidOpenTextDocumentNotification.type, params);

      const isPullServer = !!(this.capabilities as Record<string, unknown>)
        ?.diagnosticProvider;

      // Pull-model servers (e.g. ESLint with run: "onType") validate in
      // response to changes, not bare opens, so nudge them with a no-op change
      // and request diagnostics explicitly. Push servers publish on didOpen, so
      // we deliberately do NOT advance them to a second version: clangd
      // suppresses re-analysis of byte-identical changes and would never
      // publish that version, which would hang the wait below until timeout.
      if (isPullServer) {
        this.openDocuments.set(uri, 2);
        await conn.sendNotification(DidChangeTextDocumentNotification.type, {
          textDocument: { uri, version: 2 },
          contentChanges: [{ text: content }],
        });
        this.schedulePullDiagnostics(uri, filePath, [500, 2000, 5000]);
      }

      // Wait for diagnostics at the latest version we actually sent: 1 for push
      // servers (didOpen only) or 2 for pull servers (didOpen + no-op change).
      return this.openDocuments.get(uri);
    } catch (error) {
      this.logger.error(
        `[LspClient:${this.serverID}] Failed to open document: ${filePath}`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Notify the server of document changes
   */
  public async updateDocument(
    filePath: string,
    content: string,
  ): Promise<number | undefined> {
    if (!this.connection || this.disposed) return undefined;

    const uri = pathToFileURL(filePath).toString();
    const currentVersion = this.openDocuments.get(uri);

    if (currentVersion === undefined) {
      // Document not open, open it instead
      return await this.openDocument(filePath);
    }

    const newVersion = currentVersion + 1;
    this.openDocuments.set(uri, newVersion);
    this.sentContentHash.set(uri, this.computeContentHash(content));

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

    // Pull-model servers (e.g. ESLint) won't re-validate on didChange — request
    // diagnostics explicitly so the change is reflected (tagged with the new
    // version).
    this.schedulePullDiagnostics(uri, filePath, [100, 500]);

    return newVersion;
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
    this.lastDiagnosticsVersion.delete(filePath);
    this.sentContentHash.delete(uri);

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
  /**
   * Wait for diagnostics produced by the current open/change of `filePath`.
   *
   * `minVersion` is the document version dispatched by the open/change that
   * preceded this call (returned by openDocument/updateDocument). We resolve
   * on a diagnostics *receipt* whose published document version is at least
   * `minVersion`, which ties the wait to the current touch:
   *
   *  - A delayed publish from an earlier analysis carries a lower version and
   *    is ignored, so we never resolve against a stale cache.
   *  - Servers that do not report a version (publish `null`) cannot be
   *    correlated, so their receipts are accepted as a best effort.
   *  - When `minVersion` is undefined (e.g. unchanged content whose cached
   *    diagnostics are already current, or a server that has not reported a
   *    version yet) any receipt completes the wait.
   *
   * A receipt is emitted on every server response — including ones the hash
   * dedup suppresses — so an unchanged re-lint resolves promptly instead of
   * hanging. The overall timeout is a safety net for servers that never
   * publish (unsupported file or a slow cold index).
   */
  public async waitForDiagnostics(
    filePath: string,
    minVersion?: number,
  ): Promise<void> {
    // A receipt is current when its document version is at least the version
    // dispatched by the open/change preceding this wait. Both push servers
    // (clangd, rust-analyzer) and our pull requests tag receipts with a
    // version, so stale results from an earlier analysis are gated out. A
    // truly version-less receipt (a server that reports no version at all)
    // cannot be correlated and is accepted as a best effort rather than
    // hanging to the timeout.
    const isFresh = (version: number | undefined): boolean =>
      minVersion === undefined ||
      version === undefined ||
      version >= minVersion;

    // Fast path: the matching publish may already have arrived between the
    // open/change dispatch and this call.
    if (minVersion !== undefined) {
      const last = this.lastDiagnosticsVersion.get(filePath);
      if (last !== undefined && last >= minVersion) return;
    }

    return new Promise((resolve) => {
      let debounceTimer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = (timer: ReturnType<typeof setTimeout>) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        clearTimeout(timer);
        this.off('diagnosticsReceived', onReceived);
      };

      const onReceived = (path: string, version?: number) => {
        if (path !== filePath) return;
        // Ignore stale publishes from an earlier analysis.
        if (!isFresh(version)) return;

        // Debounce to coalesce follow-up publishes (e.g. syntax diagnostics
        // first, then semantic) into a single resolve.
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          cleanup(timeoutTimer);
          resolve();
        }, LspClient.DIAGNOSTICS_DEBOUNCE_MS);
      };

      // Subscribe to diagnostics receipts
      this.on('diagnosticsReceived', onReceived);

      // Safety net: a server that never publishes (unsupported file, or a slow
      // cold index) must not hang the caller forever. Cargo-backed servers like
      // rust-analyzer override the default with a larger window so a cold
      // flycheck (several seconds) is not cut off into an empty result.
      const timeoutTimer = setTimeout(() => {
        cleanup(timeoutTimer);
        resolve();
      }, this.serverInfo.diagnosticsTimeoutMs ??
        LspClient.DIAGNOSTICS_TIMEOUT_MS);
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
   * Dispose of the client and shut down the server.
   *
   * Idempotent and race-safe:
   * - Synchronously sets `disposed` and nulls `connection` / `process`
   *   so concurrent callers (process 'exit' / 'error' handlers, delayed
   *   pull-diagnostic timers, `refreshAllDiagnostics`, in-flight document
   *   operations) observe the disposed state immediately and bail out
   *   via their existing guards.
   * - Single-flight: repeat calls return the same in-flight promise.
   * - `performDispose` operates on local snapshots of `connection` /
   *   `process`; no `this.connection` access crosses an `await` boundary
   *   inside dispose. Other I/O-heavy methods (`openDocument`, delayed
   *   pull-diagnostic closures) follow the same snapshot-after-await
   *   discipline so a concurrent dispose cannot null-deref them.
   * - Each Shutdown/Exit send is wrapped individually because some
   *   servers close stdin the moment they answer Shutdown, which would
   *   otherwise leak `ERR_STREAM_DESTROYED` from the Exit notification
   *   as an unhandled rejection.
   */
  public dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;

    this.disposed = true;
    const connection = this.connection;
    const childProcess = this.process;
    this.connection = null;
    this.process = null;

    this.disposePromise = this.performDispose(connection, childProcess);
    return this.disposePromise;
  }

  private async performDispose(
    connection: ProtocolConnection | null,
    childProcess: ChildProcessWithoutNullStreams | null,
  ): Promise<void> {
    if (connection) {
      const gracefulShutdown = async () => {
        try {
          await connection.sendRequest(ShutdownRequest.type);
        } catch (err) {
          this.logger.debug(
            `[LspClient:${this.serverID}] Shutdown request failed during dispose: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        try {
          await connection.sendNotification(ExitNotification.type);
        } catch (err) {
          this.logger.debug(
            `[LspClient:${this.serverID}] Exit notification failed during dispose: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      };

      await Promise.race([
        gracefulShutdown(),
        new Promise<void>((resolve) =>
          setTimeout(resolve, LspClient.SHUTDOWN_TIMEOUT_MS),
        ),
      ]);

      try {
        connection.dispose();
      } catch (err) {
        this.logger.debug(
          `[LspClient:${this.serverID}] Connection dispose failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (childProcess) {
      try {
        childProcess.kill();
      } catch (err) {
        this.logger.debug(
          `[LspClient:${this.serverID}] Process kill failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.openDocuments.clear();
    this.diagnostics.clear();
    this.diagnosticsHash.clear();
    this.lastDiagnosticsVersion.clear();
    this.sentContentHash.clear();

    // Emit 'close' after all teardown work completes so observers
    // (LspService.on('close'), tests) see the client in its final
    // state. removeAllListeners runs last so external listeners still
    // receive this final event.
    this.emit('close');
    this.removeAllListeners();

    this.logger.debug(`[LspClient:${this.serverID}] Disposed`);
  }
}
