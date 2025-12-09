import type { FileDiff, StagewiseToolMetadata } from '@stagewise/agent-types';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import type { InferUITools, Tool, ToolSet, ToolUIPart } from 'ai';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { overwriteFileTool } from './node-runtime/file-modification/overwrite-file-tool.js';
import { readFileTool } from './node-runtime/file-modification/read-file-tool.js';
import { listFilesTool } from './node-runtime/file-modification/list-files-tool.js';
import { grepSearchTool } from './node-runtime/file-modification/grep-search-tool.js';
import { globTool } from './node-runtime/file-modification/glob-tool.js';
import { multiEditTool } from './node-runtime/file-modification/multi-edit-tool.js';
import { deleteFileTool } from './node-runtime/file-modification/delete-file-tool.js';
import { getContext7LibraryDocsTool } from './node-runtime/research/get-context7-library-docs-tool.js';
import { resolveContext7LibraryTool } from './node-runtime/research/resolve-context7-library-tool.js';

import {
  type SaveRequiredInformationParams,
  saveRequiredInformationTool,
} from './node-runtime/project-setup/save-required-information.js';
import {
  askForAppPathTool,
  askForAppPathOutputSchema,
  type AskForAppPathOutput,
} from './node-runtime/project-setup/ask-for-app-path.js';
import {
  askForAgentAccessPathTool,
  askForAgentAccessPathOutputSchema,
  type AskForAgentAccessPathOutput,
} from './node-runtime/project-setup/ask-for-agent-access-path.js';
import {
  askForIdeTool,
  askForIdeOutputSchema,
  type AskForIdeOutput,
} from './node-runtime/project-setup/ask-for-ide.js';
import {
  generateComponentTool,
  type InspirationComponent,
} from './node-runtime/inspiration/generate-component-tool.js';
import type { AppRouter, TRPCClient } from '@stagewise/api-client';

export {
  askForAppPathTool,
  askForAgentAccessPathTool,
  askForAppPathOutputSchema,
  askForAgentAccessPathOutputSchema,
  askForIdeTool,
  askForIdeOutputSchema,
  type AskForAppPathOutput,
  type AskForAgentAccessPathOutput,
  type InspirationComponent,
  type AskForIdeOutput,
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

function userInteractionTool<TInput extends { userInput: any }>(
  toolInstance: Tool<TInput, any>,
  metadata?: StagewiseToolMetadata,
) {
  return toolWithMetadata(toolInstance, {
    requiresUserInteraction: true,
    ...metadata,
  });
}

export type SetupAgentCallbacks = {
  onSaveInformation: (
    information: SaveRequiredInformationParams,
  ) => Promise<void>;
};

export type InspirationAgentCallbacks = {
  onGenerated: (component: Omit<InspirationComponent, 'compiledCode'>) => void;
};

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

export function setupAgentTools(
  clientRuntime: ClientRuntime,
  callbacks: SetupAgentCallbacks,
) {
  return {
    askForAgentAccessPathTool: userInteractionTool(
      askForAgentAccessPathTool(clientRuntime),
    ),
    askForAppPathTool: userInteractionTool(askForAppPathTool(clientRuntime)),
    askForIdeTool: userInteractionTool(askForIdeTool(clientRuntime)),
    saveRequiredInformationTool: toolWithMetadata(
      saveRequiredInformationTool(callbacks.onSaveInformation),
    ),
    overwriteFileTool: toolWithMetadata(overwriteFileTool(clientRuntime)),
    readFileTool: toolWithMetadata(readFileTool(clientRuntime)),
    listFilesTool: toolWithMetadata(listFilesTool(clientRuntime)),
    grepSearchTool: toolWithMetadata(grepSearchTool(clientRuntime)),
    globTool: toolWithMetadata(globTool(clientRuntime)),
    multiEditTool: toolWithMetadata(multiEditTool(clientRuntime)),
    deleteFileTool: toolWithMetadata(deleteFileTool(clientRuntime)),
  };
}

export function codingAgentTools(
  clientRuntime: ClientRuntime,
  apiClient: TRPCClient<AppRouter>,
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
  };
}

export function inspirationAgentTools(
  clientRuntime: ClientRuntime,
  model: LanguageModelV2,
  callbacks: InspirationAgentCallbacks,
) {
  return {
    readFileTool: toolWithMetadata(readFileTool(clientRuntime)),
    listFilesTool: toolWithMetadata(listFilesTool(clientRuntime)),
    grepSearchTool: toolWithMetadata(grepSearchTool(clientRuntime)),
    globTool: toolWithMetadata(globTool(clientRuntime)),
    generateComponentTool: toolWithMetadata(
      generateComponentTool(model, callbacks.onGenerated),
    ),
  };
}

export function noWorkspaceConfiguredAgentTools(
  apiClient: TRPCClient<AppRouter>,
) {
  return {
    getContext7LibraryDocsTool: toolWithMetadata(
      getContext7LibraryDocsTool(apiClient),
    ),
    resolveContext7LibraryTool: toolWithMetadata(
      resolveContext7LibraryTool(apiClient),
    ),
  } satisfies ToolSet;
}

// Define agent modes as a discriminated union type
export type AgentMode = 'setup' | 'coding' | 'inspiration' | 'no-workspace';

// Map each mode to its corresponding tool set
export type AgentToolSet<M extends AgentMode> = M extends 'setup'
  ? ReturnType<typeof setupAgentTools>
  : M extends 'coding'
    ? ReturnType<typeof codingAgentTools>
    : M extends 'inspiration'
      ? ReturnType<typeof inspirationAgentTools>
      : M extends 'no-workspace'
        ? ReturnType<typeof noWorkspaceConfiguredAgentTools>
        : never;

// Create a discriminated union for runtime use
export type AgentToolsContext =
  | { mode: 'setup'; tools: ReturnType<typeof setupAgentTools> }
  | { mode: 'coding'; tools: ReturnType<typeof codingAgentTools> }
  | {
      mode: 'inspiration';
      tools: ReturnType<typeof inspirationAgentTools>;
    }
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
export type AllToolsUnion = ReturnType<typeof setupAgentTools> &
  ReturnType<typeof codingAgentTools> &
  ReturnType<typeof inspirationAgentTools> &
  ReturnType<typeof noWorkspaceConfiguredAgentTools>;

export type UITools = InferUITools<AllToolsUnion>;
export type ToolPart = ToolUIPart<UITools>;
