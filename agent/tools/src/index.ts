import type { FileDiff, StagewiseToolMetadata } from '@stagewise/agent-types';
import type { InferUITools, Tool, ToolSet, ToolUIPart } from 'ai';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { overwriteFileTool } from './file-modification/overwrite-file-tool.js';
import { readFileTool } from './file-modification/read-file-tool.js';
import { listFilesTool } from './file-modification/list-files-tool.js';
import { grepSearchTool } from './file-modification/grep-search-tool.js';
import { globTool } from './file-modification/glob-tool.js';
import { multiEditTool } from './file-modification/multi-edit-tool.js';
import { deleteFileTool } from './file-modification/delete-file-tool.js';
import {
  getLintingDiagnosticsTool,
  type LintingDiagnosticsResult,
  type LintingDiagnostic,
  type FileDiagnostics,
  type DiagnosticsSummary,
} from './file-modification/get-linting-diagnostics.js';

// Re-export linting diagnostic types for external use
export type {
  LintingDiagnosticsResult,
  LintingDiagnostic,
  FileDiagnostics,
  DiagnosticsSummary,
};
import { getContext7LibraryDocsTool } from './research/get-context7-library-docs-tool.js';
import { resolveContext7LibraryTool } from './research/resolve-context7-library-tool.js';
import { executeConsoleScriptTool } from './browser-runtime/execute-console-script.js';
import {
  type ConsoleLogEntry,
  type ConsoleLogLevel,
  readConsoleLogsTool,
} from './browser-runtime/read-console-logs.js';

export type BrowserRuntime = {
  executeScript: (script: string, tabId: string) => Promise<string>;
  getConsoleLogs: (
    tabId: string,
    options?: {
      filter?: string;
      limit?: number;
      levels?: ConsoleLogLevel[];
    },
  ) => {
    success: boolean;
    logs?: ConsoleLogEntry[];
    totalCount?: number;
    error?: string;
  };
};

import { updateStagewiseMdTool } from './file-modification/trigger-stagewise-md-update.js';
import {
  exampleUserInputTool,
  exampleUserInputOutputSchema,
  type ExampleUserInputOutput,
} from './user-input/example-tool.js';
import type { AppRouter, TRPCClient } from '@stagewise/api-client';

// This is only a template for future user-input tools
export {
  exampleUserInputTool,
  exampleUserInputOutputSchema,
  type ExampleUserInputOutput,
};

// Export utilities for use by other packages if needed
export {
  checkFileSize,
  ContentSizeTracker,
  truncateContent,
} from './utils/file.js';
export {
  FILE_SIZE_LIMITS,
  FILE_SIZE_ERROR_MESSAGES,
  formatBytes,
} from './constants.js';

// Validation helper to ensure tool output conforms to SharedToolOutput structure
// Accepts boolean for success (widened from literals) but validates the structure
// This preserves the specific return type while ensuring compatibility
export function validateToolOutput<
  TOutput extends {
    message: string;
    result?: any;
    hiddenFromLLM?: { diff?: FileDiff };
    nonSerializableMetadata?: { undoExecute?: () => Promise<void> };
  },
>(output: TOutput): TOutput {
  return output;
}

function toolWithMetadata<
  TInput,
  TOutput,
  K extends StagewiseToolMetadata & Record<string, any>,
>(
  toolInstance: Tool<TInput, TOutput>,
  metadata?: K,
): Tool<TInput, TOutput> & { stagewiseMetadata: StagewiseToolMetadata & K } {
  return {
    ...toolInstance,
    stagewiseMetadata: {
      ...metadata,
    },
  } as Tool<TInput, TOutput> & { stagewiseMetadata: StagewiseToolMetadata & K };
}

function _userInteractionTool<TInput extends { userInput: any }>(
  toolInstance: Tool<TInput, any>,
  metadata?: StagewiseToolMetadata,
) {
  return toolWithMetadata(toolInstance, {
    requiresUserInteraction: true,
    ...metadata,
  });
}

type _ToolSet = { [key: string]: Tool<any, any> };
/**
 * Returns a new tools object with the 'execute' property omitted from each tool.
 *
 * This function iterates over all properties of the provided tools object
 * and constructs a new object containing only the 'description' and 'inputSchema'
 * properties for each tool, omitting the 'execute' function.
 *
 * @param tools - The original tools object with 'execute' and other properties.
 * @returns A new object containing all properties except 'execute' for each tool.
 */
export function toolsWithoutExecute<T extends _ToolSet>(tools: T): T {
  const out = {} as T;
  for (const key in tools) {
    const k = key as keyof T;
    // Copy all properties except 'execute'
    const tool = tools[k]!;
    const { execute: _execute, ...rest } = tool;
    (out as any)[k] = { ...rest };
  }
  return out;
}

/**
 * Wraps a toolset's execute functions to strip internal metadata fields
 * (hiddenFromLLM, nonSerializableMetadata) from results.
 * Useful for simplified agents that don't need undo/diff tracking.
 */
export function stripToolMetadata<T extends _ToolSet>(tools: T): T {
  const strippedTools = {} as T;
  for (const key in tools) {
    const tool = tools[key]!;
    (strippedTools as any)[key] = {
      ...tool,
      execute: tool.execute
        ? async (...args: Parameters<NonNullable<typeof tool.execute>>) => {
            const result = await tool.execute!(...args);
            if (result && typeof result === 'object') {
              const {
                hiddenFromLLM: _hiddenFromLLM,
                nonSerializableMetadata: _nonSerializableMetadata,
                ...cleanResult
              } = result as Record<string, unknown>;
              return cleanResult;
            }
            return result;
          }
        : undefined,
    };
  }
  return strippedTools;
}

export function knowledgeAgentTools(
  clientRuntime: ClientRuntime,
  overwriteClientRuntime: ClientRuntime,
) {
  return {
    overwriteFileTool: toolWithMetadata(
      overwriteFileTool(overwriteClientRuntime),
    ),
    readFileTool: toolWithMetadata(readFileTool(clientRuntime)),
    listFilesTool: toolWithMetadata(listFilesTool(clientRuntime)),
    grepSearchTool: toolWithMetadata(grepSearchTool(clientRuntime)),
    globTool: toolWithMetadata(globTool(clientRuntime)),
    multiEditTool: toolWithMetadata(multiEditTool(clientRuntime)),
    deleteFileTool: toolWithMetadata(deleteFileTool(clientRuntime)),
  } satisfies ToolSet;
}

export type CodingAgentCallbacks = {
  onUpdateStagewiseMd: ({ reason }: { reason: string }) => Promise<void>;
  getLintingDiagnostics: () => Promise<LintingDiagnosticsResult>;
};

export function codingAgentTools(
  clientRuntime: ClientRuntime,
  browserRuntime: BrowserRuntime,
  apiClient: TRPCClient<AppRouter>,
  callbacks: CodingAgentCallbacks,
) {
  return {
    overwriteFileTool: toolWithMetadata(overwriteFileTool(clientRuntime)),
    readFileTool: toolWithMetadata(readFileTool(clientRuntime)),
    listFilesTool: toolWithMetadata(listFilesTool(clientRuntime)),
    grepSearchTool: toolWithMetadata(grepSearchTool(clientRuntime)),
    globTool: toolWithMetadata(globTool(clientRuntime)),
    multiEditTool: toolWithMetadata(multiEditTool(clientRuntime)),
    deleteFileTool: toolWithMetadata(deleteFileTool(clientRuntime)),
    getContext7LibraryDocsTool: toolWithMetadata(
      getContext7LibraryDocsTool(apiClient),
    ),
    resolveContext7LibraryTool: toolWithMetadata(
      resolveContext7LibraryTool(apiClient),
    ),
    executeConsoleScriptTool: toolWithMetadata(
      executeConsoleScriptTool(browserRuntime),
    ),
    readConsoleLogsTool: toolWithMetadata(readConsoleLogsTool(browserRuntime)),
    updateStagewiseMdTool: toolWithMetadata(
      updateStagewiseMdTool(callbacks.onUpdateStagewiseMd),
    ),
    getLintingDiagnosticsTool: toolWithMetadata(
      getLintingDiagnosticsTool(callbacks.getLintingDiagnostics),
    ),
    // exampleUserInputTool: _userInteractionTool(
    //   exampleUserInputTool(clientRuntime),
    // ),
  };
}

export function noWorkspaceConfiguredAgentTools(
  apiClient: TRPCClient<AppRouter>,
  browserRuntime: BrowserRuntime,
) {
  return {
    getContext7LibraryDocsTool: toolWithMetadata(
      getContext7LibraryDocsTool(apiClient),
    ),
    resolveContext7LibraryTool: toolWithMetadata(
      resolveContext7LibraryTool(apiClient),
    ),
    executeConsoleScriptTool: toolWithMetadata(
      executeConsoleScriptTool(browserRuntime),
    ),
    readConsoleLogsTool: toolWithMetadata(readConsoleLogsTool(browserRuntime)),
  } satisfies ToolSet;
}

// Define agent modes as a discriminated union type
export type AgentMode = 'coding' | 'no-workspace';

// Map each mode to its corresponding tool set
export type AgentToolSet<M extends AgentMode> = M extends 'coding'
  ? ReturnType<typeof codingAgentTools>
  : M extends 'no-workspace'
    ? ReturnType<typeof noWorkspaceConfiguredAgentTools>
    : never;

// Create a discriminated union for runtime use
export type AgentToolsContext =
  | { mode: 'coding'; tools: ReturnType<typeof codingAgentTools> }
  | {
      mode: 'no-workspace';
      tools: ReturnType<typeof noWorkspaceConfiguredAgentTools>;
    };

// Extract just the tools for union type (when needed for generic operations)
export type AllTools = AgentToolsContext['tools'];

// Define the base tool shape that all tools share (for common operations)
export type BaseStagewiseTool = Tool<any, any> & {
  stagewiseMetadata?: StagewiseToolMetadata & Record<string, any>;
};

// For union of all possible tool names across all modes
export type AllToolNames = keyof AllTools;

// Helper to extract tool names for a specific mode
export type ToolNamesForMode<M extends AgentMode> = keyof AgentToolSet<M>;

// Backwards compatibility: AllToolsUnion for intersection of all tool sets
export type AllToolsUnion = ReturnType<typeof codingAgentTools> &
  ReturnType<typeof noWorkspaceConfiguredAgentTools>;

export type UITools = InferUITools<AllToolsUnion>;
export type ToolPart = ToolUIPart<UITools>;
