import type { Tools } from '@stagewise/agent-types';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { z } from 'zod';
import {
  DESCRIPTION as OVERWRITE_FILE_DESCRIPTION,
  overwriteFileParamsSchema,
  overwriteFileTool,
} from './overwrite-file-tool.js';
import {
  DESCRIPTION as READ_FILE_DESCRIPTION,
  readFileParamsSchema,
  readFileTool,
} from './read-file-tool.js';
import {
  DESCRIPTION as LIST_FILES_DESCRIPTION,
  listFilesParamsSchema,
  listFilesTool,
} from './list-files-tool.js';
import {
  DESCRIPTION as GREP_SEARCH_DESCRIPTION,
  grepSearchParamsSchema,
  grepSearchTool,
} from './grep-search-tool.js';
import {
  DESCRIPTION as GLOB_DESCRIPTION,
  globParamsSchema,
  globTool,
} from './glob-tool.js';
import {
  DESCRIPTION as MULTI_EDIT_DESCRIPTION,
  multiEditParamsSchema,
  multiEditTool,
} from './multi-edit-tool.js';
import {
  DESCRIPTION as DELETE_FILE_DESCRIPTION,
  deleteFileParamsSchema,
  deleteFileTool,
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

export const syntheticToolParamsSchema = z
  .object({
    toolCallId: z.string(),
    toolName: z.literal('overwriteFileTool'),
    args: overwriteFileParamsSchema,
  })
  .or(
    z.object({
      toolCallId: z.string(),
      toolName: z.literal('readFileTool'),
      args: readFileParamsSchema,
    }),
  )
  .or(
    z.object({
      toolCallId: z.string(),
      toolName: z.literal('listFilesTool'),
      args: listFilesParamsSchema,
    }),
  )
  .or(
    z.object({
      toolCallId: z.string(),
      toolName: z.literal('grepSearchTool'),
      args: grepSearchParamsSchema,
    }),
  )
  .or(
    z.object({
      toolCallId: z.string(),
      toolName: z.literal('globTool'),
      args: globParamsSchema,
    }),
  )
  .or(
    z.object({
      toolCallId: z.string(),
      toolName: z.literal('multiEditTool'),
      args: multiEditParamsSchema,
    }),
  )
  .or(
    z.object({
      toolCallId: z.string(),
      toolName: z.literal('deleteFileTool'),
      args: deleteFileParamsSchema,
    }),
  );

export function tools(clientRuntime: ClientRuntime) {
  return {
    overwriteFileTool: {
      description: OVERWRITE_FILE_DESCRIPTION,
      inputSchema: overwriteFileParamsSchema,
      stagewiseMetadata: {
        runtime: 'client',
      },
      execute: async (args) => {
        return await overwriteFileTool(args, clientRuntime);
      },
    },
    readFileTool: {
      description: READ_FILE_DESCRIPTION,
      inputSchema: readFileParamsSchema,
      stagewiseMetadata: {
        runtime: 'client',
      },
      execute: async (args) => {
        return await readFileTool(args, clientRuntime);
      },
    },
    listFilesTool: {
      description: LIST_FILES_DESCRIPTION,
      inputSchema: listFilesParamsSchema,
      stagewiseMetadata: {
        runtime: 'client',
      },
      execute: async (args) => {
        return await listFilesTool(args, clientRuntime);
      },
    },
    // findRelatedStylesTool: {
    //   description: FIND_RELATED_STYLES_DESCRIPTION,
    //   parameters: findRelatedStylesParamsSchema,
    //   stagewiseMetadata: {
    //     runtime: 'client',
    //   },
    //   execute: async (args) => {
    //     return await findRelatedStylesTool(args, clientRuntime);
    //   },
    // },
    // mapElementToSourceTool: { // <-- this should ideally be included in the first system prompt programmatically
    //   description: MAP_ELEMENT_TO_SOURCE_DESCRIPTION,
    //   parameters: mapElementToSourceParamsSchema,
    //   stagewiseMetadata: {
    //     runtime: 'client',
    //   },
    //   execute: async (args) => {
    //     return await mapElementToSourceTool(args, clientRuntime);
    //   },
    // },
    grepSearchTool: {
      description: GREP_SEARCH_DESCRIPTION,
      inputSchema: grepSearchParamsSchema,
      stagewiseMetadata: {
        runtime: 'client',
      },
      execute: async (args) => {
        return await grepSearchTool(args, clientRuntime);
      },
    },
    globTool: {
      description: GLOB_DESCRIPTION,
      inputSchema: globParamsSchema,
      stagewiseMetadata: {
        runtime: 'client',
      },
      execute: async (args) => {
        return await globTool(args, clientRuntime);
      },
    },
    multiEditTool: {
      description: MULTI_EDIT_DESCRIPTION,
      inputSchema: multiEditParamsSchema,
      stagewiseMetadata: {
        runtime: 'client',
      },
      execute: async (args) => {
        return await multiEditTool(args, clientRuntime);
      },
    },
    deleteFileTool: {
      description: DELETE_FILE_DESCRIPTION,
      inputSchema: deleteFileParamsSchema,
      stagewiseMetadata: {
        runtime: 'client',
      },
      execute: async (args) => {
        return await deleteFileTool(args, clientRuntime);
      },
    },
  } satisfies Tools;
}
