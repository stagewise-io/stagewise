import type { InferUITools, Tool } from 'ai';
import { universalToolSchemas } from '@stagewise/agent-core/types/tools';
import type {
  ToolOutputDiff,
  WithDiff,
} from '@stagewise/agent-core/types/tools';
import { z } from 'zod';

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

const questionFieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

const inputFieldSchema = z.object({
  type: z.literal('input'),
  questionId: z.string(),
  inputType: z.enum(['text', 'email', 'number', 'password']).optional(),
  label: z.string(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  defaultValue: z.union([z.string(), z.number()]).optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().optional(),
});

const radioGroupFieldSchema = z.object({
  type: z.literal('radio-group'),
  questionId: z.string(),
  label: z.string(),
  description: z.string().optional(),
  options: z.array(questionFieldOptionSchema).min(1),
  defaultValue: z.string().optional(),
  required: z.boolean().optional(),
  allowOther: z.boolean().optional(),
});

const checkboxFieldSchema = z.object({
  type: z.literal('checkbox'),
  questionId: z.string(),
  label: z.string(),
  description: z.string().optional(),
  defaultValue: z.boolean().optional(),
});

const checkboxGroupFieldSchema = z.object({
  type: z.literal('checkbox-group'),
  questionId: z.string(),
  label: z.string(),
  description: z.string().optional(),
  options: z.array(questionFieldOptionSchema).min(1),
  defaultValues: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

export const questionFieldSchema = z.discriminatedUnion('type', [
  inputFieldSchema,
  radioGroupFieldSchema,
  checkboxFieldSchema,
  checkboxGroupFieldSchema,
]);

export type QuestionField = z.infer<typeof questionFieldSchema>;

const questionFieldFlatSchema = z.object({
  type: z.enum(['input', 'radio-group', 'checkbox', 'checkbox-group']),
  questionId: z.string(),
  label: z.string(),
  description: z.string().optional(),
  inputType: z.enum(['text', 'email', 'number', 'password']).optional(),
  placeholder: z.string().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().optional(),
  options: z.array(questionFieldOptionSchema).min(1).optional(),
  allowOther: z.boolean().optional(),
  defaultValues: z.array(z.string()).optional(),
});

export const askUserQuestionsToolInputSchemaFlat = z.object({
  title: z.string().describe('Form title shown in the collapsible header.'),
  description: z
    .string()
    .optional()
    .describe('Optional top-level description.'),
  steps: z
    .array(
      z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        fields: z.array(questionFieldFlatSchema).min(1).max(10),
      }),
    )
    .min(1)
    .max(5)
    .describe('Array of form steps. Single-step forms have one entry.'),
});

export const askUserQuestionsToolInputSchema = z.object({
  title: z.string().describe('Form title shown in the collapsible header.'),
  description: z
    .string()
    .optional()
    .describe('Optional top-level description.'),
  steps: z
    .array(
      z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        fields: z.array(questionFieldSchema).min(1).max(10),
      }),
    )
    .min(1)
    .max(5)
    .describe('Array of form steps. Single-step forms have one entry.'),
});

const questionAnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export type QuestionAnswerValue = z.infer<typeof questionAnswerValueSchema>;

export const askUserQuestionsToolOutputSchema = z.object({
  completed: z.boolean(),
  cancelled: z.boolean(),
  cancelReason: z
    .enum(['user_cancelled', 'user_sent_message', 'agent_stopped'])
    .optional(),
  answers: z.record(z.string(), questionAnswerValueSchema),
  completedSteps: z.number(),
  notice: z.string().optional(),
});

export type AskUserQuestionsToolInput = z.infer<
  typeof askUserQuestionsToolInputSchema
>;
export type AskUserQuestionsToolOutput = z.infer<
  typeof askUserQuestionsToolOutputSchema
>;

export const askUserQuestionsToolSchema = {
  inputSchema: askUserQuestionsToolInputSchema,
  outputSchema: askUserQuestionsToolOutputSchema,
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
  executeShellCommandToolInputSchema,
  executeShellCommandToolOutputSchema,
  executeShellCommandToolSchema,
} from '@stagewise/agent-shell/schemas';
export type {
  CreateShellSessionToolInput,
  CreateShellSessionToolOutput,
  ExecuteShellCommandToolInput,
  ExecuteShellCommandToolOutput,
} from '@stagewise/agent-shell/schemas';
// Also imported (not just re-exported) so `allToolSchemas` below can
// reference them in local module scope.
import {
  createShellSessionToolSchema,
  executeShellCommandToolSchema,
} from '@stagewise/agent-shell/schemas';

export const allToolSchemas = {
  ...universalToolSchemas,
  getLintingDiagnostics: getLintingDiagnosticsToolSchema,
  executeSandboxJs: executeSandboxJsToolSchema,
  readConsoleLogs: readConsoleLogsToolSchema,
  listLibraryDocs: listLibraryDocsToolSchema,
  searchInLibraryDocs: searchInLibraryDocsToolSchema,
  askUserQuestions: askUserQuestionsToolSchema,
  createShellSession: createShellSessionToolSchema,
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
