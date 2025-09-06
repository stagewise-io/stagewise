import type { ToolResult, ToolWithMetadata } from '@stagewise/agent-types';
import { tool, type InferUITools, type Tool, type ToolUIPart } from 'ai';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import {
  DESCRIPTION as OVERWRITE_FILE_DESCRIPTION,
  overwriteFileParamsSchema,
  overwriteFileTool,
  type OverwriteFileParams,
} from './overwrite-file-tool.js';
import {
  DESCRIPTION as READ_FILE_DESCRIPTION,
  readFileParamsSchema,
  readFileTool,
  type ReadFileParams,
} from './read-file-tool.js';
import {
  DESCRIPTION as LIST_FILES_DESCRIPTION,
  listFilesParamsSchema,
  listFilesTool,
  type ListFilesParams,
} from './list-files-tool.js';
import {
  DESCRIPTION as GREP_SEARCH_DESCRIPTION,
  grepSearchParamsSchema,
  grepSearchTool,
  type GrepSearchParams,
} from './grep-search-tool.js';
import {
  DESCRIPTION as GLOB_DESCRIPTION,
  globParamsSchema,
  globTool,
  type GlobParams,
} from './glob-tool.js';
import {
  DESCRIPTION as MULTI_EDIT_DESCRIPTION,
  multiEditParamsSchema,
  multiEditTool,
  type MultiEditParams,
} from './multi-edit-tool.js';
import {
  DESCRIPTION as DELETE_FILE_DESCRIPTION,
  deleteFileParamsSchema,
  deleteFileTool,
  type DeleteFileParams,
} from './delete-file-tool.js';

// Export utilities for use by other packages if needed
export {
  checkFileSize,
  ContentSizeTracker,
  truncateContent,
} from './file-utils.js';
export {
  FILE_SIZE_LIMITS,
  FILE_SIZE_ERROR_MESSAGES,
  formatBytes,
} from './constants.js';

function clientSideTool<T extends Tool>(tool: T): ToolWithMetadata<T> {
  return {
    ...tool,
    stagewiseMetadata: {
      runtime: 'client',
    },
  };
}

// Define explicit return type to avoid exposing internal zod types
type CliToolsReturn = {
  overwriteFileTool: ToolWithMetadata<Tool<OverwriteFileParams, ToolResult>>;
  readFileTool: ToolWithMetadata<Tool<ReadFileParams, ToolResult>>;
  listFilesTool: ToolWithMetadata<Tool<ListFilesParams, ToolResult>>;
  grepSearchTool: ToolWithMetadata<Tool<GrepSearchParams, ToolResult>>;
  globTool: ToolWithMetadata<Tool<GlobParams, ToolResult>>;
  multiEditTool: ToolWithMetadata<Tool<MultiEditParams, ToolResult>>;
  deleteFileTool: ToolWithMetadata<Tool<DeleteFileParams, ToolResult>>;
};

// Place near CliToolsReturn
export type CliToolsWithoutExecute = {
  [K in keyof CliToolsReturn]: Pick<
    CliToolsReturn[K],
    'description' | 'inputSchema'
  >;
};

export function cliTools(clientRuntime: ClientRuntime): CliToolsReturn {
  return {
    overwriteFileTool: clientSideTool(
      tool({
        name: 'overwriteFileTool',
        description: OVERWRITE_FILE_DESCRIPTION,
        inputSchema: overwriteFileParamsSchema,
        execute: async (args) => {
          return await overwriteFileTool(args, clientRuntime);
        },
      }),
    ),
    readFileTool: clientSideTool(
      tool({
        name: 'readFileTool',
        description: READ_FILE_DESCRIPTION,
        inputSchema: readFileParamsSchema,
        execute: async (args) => {
          return await readFileTool(args, clientRuntime);
        },
      }),
    ),
    listFilesTool: clientSideTool(
      tool({
        name: 'listFilesTool',
        description: LIST_FILES_DESCRIPTION,
        inputSchema: listFilesParamsSchema,
        execute: async (args) => {
          return await listFilesTool(args, clientRuntime);
        },
      }),
    ),
    grepSearchTool: clientSideTool(
      tool({
        name: 'grepSearchTool',
        description: GREP_SEARCH_DESCRIPTION,
        inputSchema: grepSearchParamsSchema,
        execute: async (args) => {
          return await grepSearchTool(args, clientRuntime);
        },
      }),
    ),
    globTool: clientSideTool(
      tool({
        name: 'globTool',
        description: GLOB_DESCRIPTION,
        inputSchema: globParamsSchema,
        execute: async (args) => {
          return await globTool(args, clientRuntime);
        },
      }),
    ),
    multiEditTool: clientSideTool(
      tool({
        name: 'multiEditTool',
        description: MULTI_EDIT_DESCRIPTION,
        inputSchema: multiEditParamsSchema,
        execute: async (args) => {
          return await multiEditTool(args, clientRuntime);
        },
      }),
    ),
    deleteFileTool: clientSideTool(
      tool({
        name: 'deleteFileTool',
        description: DELETE_FILE_DESCRIPTION,
        inputSchema: deleteFileParamsSchema,
        execute: async (args) => {
          return await deleteFileTool(args, clientRuntime);
        },
      }),
    ),
  } satisfies CliToolsReturn;
}

export function cliToolsWithoutExecute(
  clientRuntime: ClientRuntime,
): CliToolsWithoutExecute {
  const base = cliTools(clientRuntime);
  const out = {} as CliToolsWithoutExecute;
  for (const key in base) {
    const k = key as keyof CliToolsReturn;
    const { description, inputSchema } = base[k];
    (out as any)[k] = { description, inputSchema };
  }
  return out;
}

export type CliTools = CliToolsReturn;
export type UITools = InferUITools<CliTools>;
export type ToolPart = ToolUIPart<UITools>;
