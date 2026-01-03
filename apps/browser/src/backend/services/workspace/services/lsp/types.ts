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
   */
  spawn: (projectRoot: string) => Promise<LspServerHandle | undefined>;
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
