import type { InferUITools, Tool } from 'ai';
import { universalToolSchemas } from '@stagewise/agent-core/types/tools';
import type {
  ToolOutputDiff,
  WithDiff,
} from '@stagewise/agent-core/types/tools';
import { attachmentSchema } from '../metadata';
import { imageGenerationSettingsSchema } from '../../shared-types';
import { z } from 'zod';
import { askUserQuestionsToolSchema } from './ask-user-questions';

export * from './ask-user-questions';

export {
  copyToolInputSchema,
  copyToolOutputSchema,
  copyToolSchema,
  deleteToolInputSchema,
  deleteToolSchema,
  globToolInputSchema,
  globToolOutputSchema,
  globToolSchema,
  grepSearchToolInputSchema,
  grepSearchToolOutputSchema,
  grepSearchToolSchema,
  lsToolInputSchema,
  lsToolSchema,
  mkdirToolInputSchema,
  mkdirToolOutputSchema,
  mkdirToolSchema,
  multiEditToolInputSchema,
  multiEditToolOutputSchema,
  multiEditToolSchema,
  readToolInputSchema,
  readToolOutputSchema,
  readToolSchema,
  universalToolSchemas,
  writeToolInputSchema,
  writeToolOutputSchema,
  writeToolSchema,
} from '@stagewise/agent-core/types/tools';

export type {
  CopyToolInput,
  CopyToolOutput,
  DeleteToolInput,
  GlobToolInput,
  GlobToolOutput,
  GrepSearchToolInput,
  GrepSearchToolOutput,
  LsToolInput,
  MkdirToolInput,
  MkdirToolOutput,
  MultiEditToolInput,
  MultiEditToolOutput,
  readToolInput,
  ReadToolOutput,
  UniversalToolSchemas,
  UniversalTools,
  WriteToolInput,
  WriteToolOutput,
} from '@stagewise/agent-core/types/tools';

export const getLintingDiagnosticsToolInputSchema = z.object({
  paths: z
    .array(z.string())
    .describe(
      'File paths to check for diagnostics. Each must include a valid mount prefix, e.g. "w1a2b/src/file.ts".',
    ),
});

export const lintingDiagnosticSchema = z.object({
  line: z.number(),
  column: z.number(),
  severity: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .default(1),
  source: z.string(),
  message: z.string(),
  code: z.string().optional(),
});

export const fileDiagnosticsSchema = z.object({
  path: z
    .string()
    .describe(
      'Path to the file to get linting diagnostics for. Must include a valid mount prefix. e.g. "/ws1/path/to/file.ts"',
    ),
  diagnostics: z.array(lintingDiagnosticSchema),
});

export const diagnosticsSummarySchema = z.object({
  totalFiles: z.number(),
  totalIssues: z.number(),
  errors: z.number(),
  warnings: z.number(),
  infos: z.number(),
  hints: z.number(),
});

export const getLintingDiagnosticsToolOutputSchema = z.object({
  message: z.string(),
  files: z.array(fileDiagnosticsSchema),
  summary: diagnosticsSummarySchema,
});

export type LintingDiagnostic = z.infer<typeof lintingDiagnosticSchema>;
export type FileDiagnostics = z.infer<typeof fileDiagnosticsSchema>;
export type DiagnosticsSummary = z.infer<typeof diagnosticsSummarySchema>;
export type GetLintingDiagnosticsToolInput = z.infer<
  typeof getLintingDiagnosticsToolInputSchema
>;
export type GetLintingDiagnosticsToolOutput = z.infer<
  typeof getLintingDiagnosticsToolOutputSchema
>;

export const getLintingDiagnosticsToolSchema = {
  inputSchema: getLintingDiagnosticsToolInputSchema,
  outputSchema: getLintingDiagnosticsToolOutputSchema,
} as const;

export const executeSandboxJsToolInputSchema = z.object({
  explanation: z
    .string()
    .describe(
      'Concise (max 5 words) human-readable description of what this script does. Examples: "Take a screenshot", "Read workspace files", "Query DOM elements", "Process API response", "Generate image thumbnail"',
    ),
  script: z.string().describe('JavaScript code to execute'),
});

export const executeSandboxJsToolOutputSchema = z.object({
  message: z.string(),
  result: z.any(),
});

export type ExecuteSandboxJsToolInput = z.infer<
  typeof executeSandboxJsToolInputSchema
>;
export type ExecuteSandboxJsToolOutput = z.infer<
  typeof executeSandboxJsToolOutputSchema
>;

export const executeSandboxJsToolSchema = {
  inputSchema: executeSandboxJsToolInputSchema,
  outputSchema: executeSandboxJsToolOutputSchema,
} as const;

export const generateImageToolInputSchema =
  imageGenerationSettingsSchema.extend({
    prompt: z.string().min(1).describe('Detailed prompt for the image model'),
    providerInstanceId: z
      .string()
      .optional()
      .describe('Chosen image provider instance; a host pin may override it'),
    modelId: z
      .string()
      .optional()
      .describe('Chosen image model; a host pin may override it'),
    outputFormat: z.enum(['png', 'jpeg', 'webp']).optional(),
    background: z.enum(['auto', 'transparent', 'opaque']).optional(),
    seed: z.number().int().optional(),
  });

export const generateImageToolOutputSchema = z.object({
  message: z.string(),
  providerInstanceId: z.string(),
  modelId: z.string(),
  attachment: attachmentSchema.extend({
    originalFileName: z.string(),
    mediaType: z.string(),
  }),
  effectiveSettings: imageGenerationSettingsSchema,
});

export type GenerateImageToolInput = z.infer<
  typeof generateImageToolInputSchema
>;
export type GenerateImageToolOutput = z.infer<
  typeof generateImageToolOutputSchema
>;

export const generateImageToolSchema = {
  inputSchema: generateImageToolInputSchema,
  outputSchema: generateImageToolOutputSchema,
} as const;

export const consoleLogLevelSchema = z.enum([
  'log',
  'debug',
  'info',
  'error',
  'warning',
  'dir',
  'dirxml',
  'table',
  'trace',
  'clear',
  'startGroup',
  'startGroupCollapsed',
  'endGroup',
  'assert',
  'profile',
  'profileEnd',
  'count',
  'timeEnd',
]);

export type ConsoleLogLevel = z.infer<typeof consoleLogLevelSchema>;

export const readConsoleLogsToolInputSchema = z.object({
  id: z.string().describe('The tab ID to read console logs from'),
  filter: z
    .string()
    .optional()
    .describe('Case-insensitive substring to filter logs by'),
  limit: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .describe('Maximum number of logs to return (most recent first)'),
  levels: z
    .array(consoleLogLevelSchema)
    .optional()
    .describe('Filter by specific log levels'),
  delayMs: z
    .number()
    .int()
    .min(0)
    .max(5000)
    .optional()
    .describe(
      'Milliseconds to wait BEFORE reading logs. Use after injecting monitoring code to capture async/animation logs.',
    ),
});

export const readConsoleLogsToolOutputSchema = z.object({
  message: z.string(),
  result: z.any(),
});

export type ReadConsoleLogsToolInput = z.infer<
  typeof readConsoleLogsToolInputSchema
>;
export type ReadConsoleLogsToolOutput = z.infer<
  typeof readConsoleLogsToolOutputSchema
>;

export const readConsoleLogsToolSchema = {
  inputSchema: readConsoleLogsToolInputSchema,
  outputSchema: readConsoleLogsToolOutputSchema,
} as const;

export const searchInLibraryDocsToolInputSchema = z.object({
  libraryId: z.string().describe('ID for which docs should be searched'),
  topic: z.string().describe('Topic to search for in the docs'),
});

export const searchInLibraryDocsToolOutputSchema = z.object({
  message: z.string(),
  content: z.string(),
  truncated: z.boolean(),
});

export type SearchInLibraryDocsToolInput = z.infer<
  typeof searchInLibraryDocsToolInputSchema
>;
export type SearchInLibraryDocsToolOutput = z.infer<
  typeof searchInLibraryDocsToolOutputSchema
>;

export const searchInLibraryDocsToolSchema = {
  inputSchema: searchInLibraryDocsToolInputSchema,
  outputSchema: searchInLibraryDocsToolOutputSchema,
} as const;

export const listLibraryDocsToolInputSchema = z.object({
  name: z.string().describe('Library name for which to search for matches.'),
});

export const listLibraryDocsToolOutputSchema = z.object({
  message: z.string(),
  library: z.string(),
  results: z.array(
    z.object({
      libraryId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      trustScore: z.number().optional(),
      versions: z.array(z.string()).optional(),
    }),
  ),
  truncated: z.boolean(),
  itemsRemoved: z.number().optional(),
});

export type ListLibraryDocsToolInput = z.infer<
  typeof listLibraryDocsToolInputSchema
>;
export type ListLibraryDocsToolOutput = z.infer<
  typeof listLibraryDocsToolOutputSchema
>;

export const listLibraryDocsToolSchema = {
  inputSchema: listLibraryDocsToolInputSchema,
  outputSchema: listLibraryDocsToolOutputSchema,
} as const;

// ============================================================================
// Create Shell Session Tool
// ============================================================================

// Shell tool schemas live in `@stagewise/agent-shell/schemas` (single source
// of truth shared with the Node shell runtime). Re-exported here so existing
// browser UI / contract imports continue to resolve unchanged.
export {
  createShellSessionToolInputSchema,
  createShellSessionToolOutputSchema,
  createShellSessionToolSchema,
  createWatcherSessionToolInputSchema,
  createWatcherSessionToolOutputSchema,
  createWatcherSessionToolSchema,
  executeShellCommandToolInputSchema,
  executeShellCommandToolOutputSchema,
  executeShellCommandToolSchema,
} from '@stagewise/agent-shell/schemas';
export type {
  CreateShellSessionToolInput,
  CreateShellSessionToolOutput,
  CreateWatcherSessionToolInput,
  CreateWatcherSessionToolOutput,
  ExecuteShellCommandToolInput,
  ExecuteShellCommandToolOutput,
} from '@stagewise/agent-shell/schemas';
// Also imported (not just re-exported) so `allToolSchemas` below can
// reference them in local module scope.
import {
  createShellSessionToolSchema,
  createWatcherSessionToolSchema,
  executeShellCommandToolSchema,
} from '@stagewise/agent-shell/schemas';

export const allToolSchemas = {
  ...universalToolSchemas,
  getLintingDiagnostics: getLintingDiagnosticsToolSchema,
  executeSandboxJs: executeSandboxJsToolSchema,
  generateImage: generateImageToolSchema,
  readConsoleLogs: readConsoleLogsToolSchema,
  listLibraryDocs: listLibraryDocsToolSchema,
  searchInLibraryDocs: searchInLibraryDocsToolSchema,
  askUserQuestions: askUserQuestionsToolSchema,
  createShellSession: createShellSessionToolSchema,
  createWatcherSession: createWatcherSessionToolSchema,
  executeShellCommand: executeShellCommandToolSchema,
} as const;

export type AllTools = typeof allToolSchemas;

export type UIAgentTools = InferUITools<AllTools>;

export type StagewiseToolSet = {
  [K in keyof AllTools]: Tool<
    AllTools[K]['inputSchema'],
    AllTools[K]['outputSchema']
  >;
};

export type ToolName = keyof StagewiseToolSet;

export type { ToolOutputDiff, WithDiff };
