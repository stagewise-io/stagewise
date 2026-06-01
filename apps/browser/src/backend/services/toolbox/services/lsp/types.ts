import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type {
  ProtocolConnection,
  ServerCapabilities,
} from 'vscode-languageserver-protocol/node';
import type {
  Diagnostic,
  SymbolInformation,
  WorkspaceSymbol,
} from 'vscode-languageserver-types';

// Re-export commonly used types from vscode-languageserver-types
export {
  Diagnostic,
  DiagnosticSeverity,
  Position,
  Range,
  Location,
  LocationLink,
  DocumentSymbol,
  SymbolKind,
  SymbolInformation,
  WorkspaceSymbol,
  CompletionItem,
  CompletionItemKind,
  Hover,
  MarkedString,
  MarkupContent,
  MarkupKind,
  TextEdit,
  CodeAction,
  CodeActionKind,
  Command,
} from 'vscode-languageserver-types';

// Re-export protocol types for LSP messages
export type {
  ServerCapabilities,
  TextDocumentItem,
  TextDocumentIdentifier,
  VersionedTextDocumentIdentifier,
  PublishDiagnosticsParams,
  TextDocumentPositionParams,
  InitializeParams,
  InitializeResult,
  DidOpenTextDocumentParams,
  DidCloseTextDocumentParams,
  DidChangeTextDocumentParams,
  HoverParams,
  DefinitionParams,
  ReferenceParams,
  DocumentSymbolParams,
  WorkspaceSymbolParams,
  CodeActionParams,
  CompletionParams,
} from 'vscode-languageserver-protocol';

/**
 * Handle returned when spawning an LSP server process
 */
export interface LspServerHandle {
  process: ChildProcessWithoutNullStreams;
  initializationOptions?: Record<string, unknown>;
}

/**
 * Definition for an LSP server
 */
export interface LspServerInfo {
  /** Unique identifier for this server (e.g., "typescript", "eslint", "biome") */
  id: string;

  /** Human-readable name */
  name: string;

  /** File extensions this server handles (e.g., [".ts", ".tsx", ".js", ".jsx"]) */
  extensions: string[];

  /**
   * Check if this server should be activated for a project.
   * Returns true if relevant config/dependencies exist.
   * The project root is provided externally.
   */
  shouldActivate: (projectRoot: string) => Promise<boolean>;

  /**
   * Spawn the LSP server process for a given project root.
   * Returns undefined if the server binary is not available.
   *
   * @param resolvedEnv - Pre-resolved user shell environment (from resolveShellEnv).
   *   When provided, used as the `env` for child_process.spawn() so that LSP
   *   binaries can find `node`, `npx`, etc. on the user's real PATH.
   *   Falls back to `process.env` when null/undefined.
   */
  spawn: (
    projectRoot: string,
    resolvedEnv?: Record<string, string> | null,
  ) => Promise<LspServerHandle | undefined>;

  /**
   * Optional override for how long `waitForDiagnostics` waits for a fresh
   * diagnostics publish before giving up (milliseconds). The wait still
   * resolves early the moment a matching receipt arrives — this is only the
   * safety-net cap. Servers backed by a slow external checker (e.g.
   * rust-analyzer's `cargo check` flycheck, which can take several seconds on
   * a cold cache) need a larger value than the default so a cold first open
   * does not report an empty result. Defaults to 3000ms when unset.
   */
  diagnosticsTimeoutMs?: number;

  /**
   * Force the client to treat this server as push-only for diagnostics,
   * ignoring any advertised `diagnosticProvider` (pull) capability.
   *
   * Some native servers advertise pull support but deliver their authoritative
   * diagnostics exclusively via push (`textDocument/publishDiagnostics`).
   * rust-analyzer is the canonical example: its pull endpoint
   * (`textDocument/diagnostic`) only returns syntax/proc-macro diagnostics and
   * always omits the `cargo check` (flycheck) results, which arrive solely via
   * push after a delay. Querying the pull endpoint therefore returns an empty
   * report that resolves `waitForDiagnostics` prematurely — before the real
   * push lands — surfacing an empty result. clangd is likewise push-native.
   *
   * When true, the client skips the pull path entirely and does not advance the
   * document to a no-op second version, so the wait resolves on the genuine
   * push (or the safety-net timeout) instead of an empty pull.
   */
  pushDiagnosticsOnly?: boolean;
}

/**
 * Status of an LSP server connection
 */
export type LspServerStatus =
  | { state: 'stopped'; serverID: string }
  | { state: 'starting'; serverID: string }
  | { state: 'running'; serverID: string; root: string }
  | { state: 'error'; serverID: string; error: string };

/**
 * Internal state for a connected LSP client
 */
export interface LspClientState {
  serverID: string;
  root: string;
  connection: ProtocolConnection;
  process: ChildProcessWithoutNullStreams;
  openDocuments: Set<string>;
  diagnostics: Map<string, Diagnostic[]>;
  capabilities: ServerCapabilities | null;
}

/**
 * LSP symbol with server origin tracking
 */
export interface LspSymbol {
  serverID: string;
  symbol: SymbolInformation | WorkspaceSymbol;
}

/**
 * Aggregated diagnostic with server origin
 */
export interface AggregatedDiagnostic {
  serverID: string;
  diagnostic: Diagnostic;
}

/**
 * Event types for LSP service
 */
export type LspEvent =
  | { type: 'diagnostics'; path: string; serverID: string }
  | { type: 'serverStarted'; serverID: string; root: string }
  | { type: 'serverStopped'; serverID: string }
  | { type: 'serverError'; serverID: string; error: string };
