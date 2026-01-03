import { EventEmitter } from 'node:events';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type {
  Diagnostic,
  Position,
  Location,
  LocationLink,
  DocumentSymbol,
  SymbolInformation,
  Hover,
  CodeAction,
} from 'vscode-languageserver-types';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import { DisposableService } from '@/services/disposable';
import type { Logger } from '@/services/logger';
import { LspClient } from './client';
import { servers, getServersForExtension } from './servers';
import { getExtension } from './language-map';
import type {
  LspServerInfo,
  LspServerStatus,
  AggregatedDiagnostic,
  LspSymbol,
} from './types';

export interface LspServiceEvents {
  diagnostics: (absoluteFilePath: string) => void;
  serverStarted: (serverID: string) => void;
  serverStopped: (serverID: string) => void;
  serverError: (serverID: string, error: string) => void;
}

/**
 * LspService - Orchestrates multiple LSP server connections
 *
 * Features:
 * - Lazy spawning: Servers are started on-demand when a file is touched
 * - Multi-server support: Multiple servers can handle the same file
 * - Diagnostic aggregation: Merges diagnostics from all servers
 * - Broken server tracking: Skips servers that failed to start
 */
export class LspService extends DisposableService {
  private readonly logger: Logger;
  private readonly clientRuntime: ClientRuntime;
  private readonly emitter = new EventEmitter();

  /** Active LSP client instances: serverID -> LspClient */
  private clients = new Map<string, LspClient>();

  /** Servers that failed to spawn */
  private brokenServers = new Set<string>();

  /** Pending client creation promises to avoid duplicate spawns */
  private pendingClients = new Map<string, Promise<LspClient | undefined>>();

  /** Cache of server activation checks */
  private activationCache = new Map<string, boolean>();

  private constructor(logger: Logger, clientRuntime: ClientRuntime) {
    super();
    this.logger = logger;
    this.clientRuntime = clientRuntime;
  }

  /**
   * Create a new LspService instance
   */
  public static async create(
    logger: Logger,
    clientRuntime: ClientRuntime,
  ): Promise<LspService> {
    const instance = new LspService(logger, clientRuntime);
    logger.debug(
      `[LspService] Created service for project: ${clientRuntime.fileSystem.getCurrentWorkingDirectory()}`,
    );
    return instance;
  }

  /**
   * Touch a file to trigger LSP analysis
   */
  public async touchFile(
    filePath: string,
    waitForDiagnostics = false,
  ): Promise<void> {
    const absoluteFilePath =
      this.clientRuntime.fileSystem.resolvePath(filePath);
    const clients = await this.getOrCreateClientsForFile(absoluteFilePath);

    if (clients.length === 0) {
      this.logger.debug(
        `[LspService] No LSP servers available for: ${absoluteFilePath}`,
      );
      return;
    }

    // Start waiting for diagnostics BEFORE opening (to not miss fast responses)
    const waitPromises = waitForDiagnostics
      ? clients.map((client) => client.waitForDiagnostics(absoluteFilePath))
      : [];

    // Open document in all clients
    const openPromises = clients.map((client) =>
      client.openDocument(absoluteFilePath),
    );
    await Promise.all(openPromises);

    // Wait for all diagnostics if requested
    if (waitForDiagnostics) {
      await Promise.all(waitPromises);
    }
  }

  /**
   * Update a file's content in all applicable LSP servers
   */
  public async updateFile(filePath: string, content: string): Promise<void> {
    const absoluteFilePath =
      this.clientRuntime.fileSystem.resolvePath(filePath);
    const clients = await this.getClientsForFile(absoluteFilePath);
    const updatePromises = clients.map((client) =>
      client.updateDocument(absoluteFilePath, content),
    );
    await Promise.all(updatePromises);
  }

  /**
   * Close a file in all applicable LSP servers
   */
  public async closeFile(filePath: string): Promise<void> {
    const absoluteFilePath =
      this.clientRuntime.fileSystem.resolvePath(filePath);
    const clients = await this.getClientsForFile(absoluteFilePath);
    const closePromises = clients.map((client) =>
      client.closeDocument(absoluteFilePath),
    );
    await Promise.all(closePromises);
  }

  /**
   * Get diagnostics for a file from all servers
   */
  public async getDiagnosticsForFile(
    filePath: string,
  ): Promise<AggregatedDiagnostic[]> {
    const absoluteFilePath =
      this.clientRuntime.fileSystem.resolvePath(filePath);
    const clients = await this.getClientsForFile(absoluteFilePath);
    const results: AggregatedDiagnostic[] = [];

    for (const client of clients) {
      const diagnostics = client.getDiagnostics(absoluteFilePath);
      for (const diagnostic of diagnostics) {
        results.push({ serverID: client.serverID, diagnostic });
      }
    }

    return results;
  }

  /**
   * Get all diagnostics from all servers
   */
  public getAllDiagnostics(): Map<string, AggregatedDiagnostic[]> {
    const result = new Map<string, AggregatedDiagnostic[]>();

    for (const client of this.clients.values()) {
      const clientDiagnostics = client.getAllDiagnostics();
      for (const [filePath, diagnostics] of clientDiagnostics) {
        const existing = result.get(filePath) ?? [];
        for (const diagnostic of diagnostics) {
          existing.push({ serverID: client.serverID, diagnostic });
        }
        result.set(filePath, existing);
      }
    }

    return result;
  }

  /**
   * Get hover information from all servers
   */
  public async hover(
    filePath: string,
    position: Position,
  ): Promise<Array<{ serverID: string; hover: Hover }>> {
    const absoluteFilePath =
      this.clientRuntime.fileSystem.resolvePath(filePath);
    const clients = await this.getClientsForFile(absoluteFilePath);
    const results: Array<{ serverID: string; hover: Hover }> = [];

    const hoverPromises = clients.map(async (client) => {
      const hover = await client.hover(absoluteFilePath, position);
      if (hover) {
        results.push({ serverID: client.serverID, hover });
      }
    });

    await Promise.all(hoverPromises);
    return results;
  }

  /**
   * Get definitions from all servers
   */
  public async definition(
    filePath: string,
    position: Position,
  ): Promise<
    Array<{ serverID: string; locations: (Location | LocationLink)[] }>
  > {
    const absoluteFilePath =
      this.clientRuntime.fileSystem.resolvePath(filePath);
    const clients = await this.getClientsForFile(absoluteFilePath);
    const results: Array<{
      serverID: string;
      locations: (Location | LocationLink)[];
    }> = [];

    const defPromises = clients.map(async (client) => {
      const def = await client.definition(absoluteFilePath, position);
      if (def) {
        const locations = Array.isArray(def) ? def : [def];
        results.push({ serverID: client.serverID, locations });
      }
    });

    await Promise.all(defPromises);
    return results;
  }

  /**
   * Get references from all servers
   */
  public async references(
    filePath: string,
    position: Position,
  ): Promise<Array<{ serverID: string; locations: Location[] }>> {
    const absoluteFilePath =
      this.clientRuntime.fileSystem.resolvePath(filePath);
    const clients = await this.getClientsForFile(absoluteFilePath);
    const results: Array<{ serverID: string; locations: Location[] }> = [];

    const refPromises = clients.map(async (client) => {
      const refs = await client.references(absoluteFilePath, position);
      if (refs) {
        results.push({ serverID: client.serverID, locations: refs });
      }
    });

    await Promise.all(refPromises);
    return results;
  }

  /**
   * Get document symbols from all servers
   */
  public async documentSymbol(
    filePath: string,
  ): Promise<
    Array<{ serverID: string; symbols: DocumentSymbol[] | SymbolInformation[] }>
  > {
    const absoluteFilePath =
      this.clientRuntime.fileSystem.resolvePath(filePath);
    const clients = await this.getClientsForFile(absoluteFilePath);
    const results: Array<{
      serverID: string;
      symbols: DocumentSymbol[] | SymbolInformation[];
    }> = [];

    const symbolPromises = clients.map(async (client) => {
      const symbols = await client.documentSymbol(absoluteFilePath);
      if (symbols) {
        results.push({ serverID: client.serverID, symbols });
      }
    });

    await Promise.all(symbolPromises);
    return results;
  }

  /**
   * Search for workspace symbols across all servers
   */
  public async workspaceSymbol(query: string): Promise<LspSymbol[]> {
    const results: LspSymbol[] = [];

    const searchPromises = Array.from(this.clients.values()).map(
      async (client) => {
        const symbols = await client.workspaceSymbol(query);
        if (symbols) {
          for (const symbol of symbols) {
            results.push({ serverID: client.serverID, symbol });
          }
        }
      },
    );

    await Promise.all(searchPromises);
    return results;
  }

  /**
   * Get code actions from all servers
   */
  public async codeAction(
    filePath: string,
    range: { start: Position; end: Position },
  ): Promise<Array<{ serverID: string; actions: CodeAction[] }>> {
    const absoluteFilePath =
      this.clientRuntime.fileSystem.resolvePath(filePath);
    const clients = await this.getClientsForFile(absoluteFilePath);
    const results: Array<{ serverID: string; actions: CodeAction[] }> = [];

    const actionPromises = clients.map(async (client) => {
      const actions = await client.codeAction(absoluteFilePath, range);
      if (actions && actions.length > 0) {
        results.push({ serverID: client.serverID, actions });
      }
    });

    await Promise.all(actionPromises);
    return results;
  }

  /**
   * Get status of all LSP servers
   */
  public getStatus(): LspServerStatus[] {
    const statuses: LspServerStatus[] = [];

    for (const server of servers) {
      const client = this.clients.get(server.id);

      if (!client) {
        statuses.push({ state: 'stopped', serverID: server.id });
      } else if (client.isRunning()) {
        statuses.push({
          state: 'running',
          serverID: server.id,
          root: this.clientRuntime.fileSystem.getCurrentWorkingDirectory(),
        });
      }
    }

    return statuses;
  }

  /**
   * Check if any LSP clients are available for a file
   */
  public async hasClientsForFile(filePath: string): Promise<boolean> {
    const absoluteFilePath =
      this.clientRuntime.fileSystem.resolvePath(filePath);
    const clients = await this.getClientsForFile(absoluteFilePath);
    return clients.length > 0;
  }

  /**
   * Format a diagnostic for display
   */
  public static formatDiagnostic(
    diagnostic: Diagnostic,
    filePath?: string,
  ): string {
    const severity = LspService.getSeverityString(diagnostic.severity);
    const location = filePath
      ? `${filePath}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`
      : `${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`;
    const source = diagnostic.source ? `[${diagnostic.source}]` : '';
    const code = diagnostic.code ? ` (${diagnostic.code})` : '';

    return `${severity} ${location}${source}${code}: ${diagnostic.message}`;
  }

  private static getSeverityString(severity: number | undefined): string {
    switch (severity) {
      case DiagnosticSeverity.Error:
        return 'error';
      case DiagnosticSeverity.Warning:
        return 'warning';
      case DiagnosticSeverity.Information:
        return 'info';
      case DiagnosticSeverity.Hint:
        return 'hint';
      default:
        return 'unknown';
    }
  }

  /**
   * Event subscription
   */
  public on<K extends keyof LspServiceEvents>(
    event: K,
    listener: LspServiceEvents[K],
  ): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  public off<K extends keyof LspServiceEvents>(
    event: K,
    listener: LspServiceEvents[K],
  ): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Get existing clients for a file (does not create new ones)
   */
  private async getClientsForFile(filePath: string): Promise<LspClient[]> {
    const ext = getExtension(filePath);
    const applicableServers = getServersForExtension(ext);
    const clients: LspClient[] = [];

    for (const serverInfo of applicableServers) {
      const client = this.clients.get(serverInfo.id);
      if (client?.isRunning()) {
        clients.push(client);
      }
    }

    return clients;
  }

  /**
   * Get or create clients for a file
   */
  private async getOrCreateClientsForFile(
    filePath: string,
  ): Promise<LspClient[]> {
    const ext = getExtension(filePath);
    const applicableServers = getServersForExtension(ext);
    const clients: LspClient[] = [];

    for (const serverInfo of applicableServers) {
      // Skip broken servers
      if (this.brokenServers.has(serverInfo.id)) {
        continue;
      }

      const client = await this.getOrCreateClient(serverInfo);
      if (client) {
        clients.push(client);
      }
    }

    return clients;
  }

  /**
   * Check if a server should be activated (with caching)
   */
  private async shouldActivateServer(
    serverInfo: LspServerInfo,
  ): Promise<boolean> {
    const cached = this.activationCache.get(serverInfo.id);
    if (cached !== undefined) {
      return cached;
    }

    const shouldActivate = await serverInfo.shouldActivate(
      this.clientRuntime.fileSystem.getCurrentWorkingDirectory(),
    );
    this.activationCache.set(serverInfo.id, shouldActivate);
    return shouldActivate;
  }

  /**
   * Get or create a client for a server
   */
  private async getOrCreateClient(
    serverInfo: LspServerInfo,
  ): Promise<LspClient | undefined> {
    // Return existing client if available
    const existingClient = this.clients.get(serverInfo.id);
    if (existingClient?.isRunning()) {
      return existingClient;
    }

    // Check if already spawning
    const pendingPromise = this.pendingClients.get(serverInfo.id);
    if (pendingPromise) {
      return pendingPromise;
    }

    // Check if server should activate
    const shouldActivate = await this.shouldActivateServer(serverInfo);
    if (!shouldActivate) {
      return undefined;
    }

    // Create new client
    const createPromise = this.createClient(serverInfo);
    this.pendingClients.set(serverInfo.id, createPromise);

    try {
      return await createPromise;
    } finally {
      this.pendingClients.delete(serverInfo.id);
    }
  }

  /**
   * Create a new LSP client
   */
  private async createClient(
    serverInfo: LspServerInfo,
  ): Promise<LspClient | undefined> {
    this.logger.debug(
      `[LspService] Creating client for ${serverInfo.id} at ${this.clientRuntime.fileSystem.getCurrentWorkingDirectory()}`,
    );

    const client = await LspClient.create(
      serverInfo,
      this.logger,
      this.clientRuntime.fileSystem.getCurrentWorkingDirectory(),
    );

    if (!client) {
      this.brokenServers.add(serverInfo.id);
      this.logger.warn(
        `[LspService] Failed to create client for ${serverInfo.id}`,
      );
      this.emitter.emit('serverError', serverInfo.id, 'Failed to spawn server');
      return undefined;
    }

    // Set up event handlers
    client.on('diagnostics', (filePath: string) => {
      const absoluteFilePath =
        this.clientRuntime.fileSystem.resolvePath(filePath);
      this.emitter.emit('diagnostics', absoluteFilePath);
    });

    client.on('close', () => {
      this.clients.delete(serverInfo.id);
      this.emitter.emit('serverStopped', serverInfo.id);
    });

    client.on('error', (error: Error) => {
      this.logger.error(
        `[LspService] Client error for ${serverInfo.id}:`,
        error,
      );
      this.emitter.emit('serverError', serverInfo.id, error.message);
    });

    this.clients.set(serverInfo.id, client);
    this.emitter.emit('serverStarted', serverInfo.id);

    return client;
  }

  /**
   * Dispose of all clients and clean up
   */
  protected onTeardown(): void {
    this.logger.debug('[LspService] Tearing down');

    const disposePromises = Array.from(this.clients.values()).map((client) =>
      client.dispose(),
    );

    Promise.all(disposePromises).then(() => {
      this.clients.clear();
      this.brokenServers.clear();
      this.pendingClients.clear();
      this.activationCache.clear();
      this.emitter.removeAllListeners();
      this.logger.debug('[LspService] Teardown complete');
    });
  }
}

// Re-export types for convenience
export * from './types';
export { LspClient } from './client';
export { servers, getServersForExtension, getServerById } from './servers';
export { getLanguageId, getExtension } from './language-map';
