import { z } from 'zod';
import type { InferUITools, Tool } from 'ai';

/**
 * Tool Schema Definitions
 *
 * These schemas define the input and output types for agent tools.
 * They are kept separate from the tool implementations (execute functions)
 * so that both UI and backend can import the types.
 *
 * The backend (toolbox service) uses these schemas to construct tools with
 * actual execute functions. The UI uses the inferred types for rendering
 * tool calls and their outputs.
 */

export const overwriteFileToolInputSchema = z.object({
  relative_path: z
    .string()
    .describe(
      'Relative file path to overwrite or create. Must include a valid mount prefix. e.g. "ws1/path/to/file.ts" or "apps/my-app/index.html"',
    ),
  content: z
    .string()
    .describe(
      'New content for the file. Leading/trailing markdown code block markers (```) are automatically removed.',
    ),
});

export const overwriteFileToolOutputSchema = z.object({
  message: z.string(),
});

export type OverwriteFileToolInput = z.infer<
  typeof overwriteFileToolInputSchema
>;
export type OverwriteFileToolOutput = z.infer<
  typeof overwriteFileToolOutputSchema
>;

/**
 * Schema definition for overwriteFile (without execute function)
 */
export const overwriteFileToolSchema = {
  inputSchema: overwriteFileToolInputSchema,
  outputSchema: overwriteFileToolOutputSchema,
} as const;

export const readFileToolInputSchema = z.object({
  relative_path: z
    .string()
    .describe(
      'Relative path of file to read. File must exist. Must include a valid mount prefix. e.g. "ws1/path/to/file.ts" or "apps/my-app/index.html"',
    ),
  start_line: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Starting line number (1-indexed, INCLUSIVE). Must be >= 1. Omit to read from beginning.',
    ),
  end_line: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Ending line number (1-indexed, INCLUSIVE). Must be >= start_line. Omit to read to end.',
    ),
});

export const readFileToolOutputSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  result: z.object({
    content: z.string().optional(),
    totalLines: z.number().optional(),
    linesRead: z.number(),
    truncated: z.boolean(),
    originalSize: z.number(),
    cappedSize: z.number(),
  }),
});

export type ReadFileToolInput = z.infer<typeof readFileToolInputSchema>;
export type ReadFileToolOutput = z.infer<typeof readFileToolOutputSchema>;

/**
 * Schema definition for readFile (without execute function)
 */
export const readFileToolSchema = {
  inputSchema: readFileToolInputSchema,
  outputSchema: readFileToolOutputSchema,
} as const;

export const listFilesToolInputSchema = z.object({
  relative_path: z
    .string()
    .describe(
      'Path to list. Must include a valid mount prefix. e.g. "/ws1/path/to/list"',
    ),
  recursive: z
    .boolean()
    .optional()
    .describe('Whether to list recursively. Defaults to false.'),
  maxDepth: z
    .number()
    .min(0)
    .optional()
    .describe(
      'Maximum recursion depth (must be >= 0). Defaults to unlimited. Depth is 0-indexed from starting directory.',
    ),
  pattern: z
    .string()
    .optional()
    .describe(
      "File extension or glob pattern to filter results. Examples: '.ts', '*.js'.",
    ),
  includeDirectories: z
    .boolean()
    .optional()
    .describe('Include directories in results. Defaults to true.'),
  includeFiles: z
    .boolean()
    .optional()
    .describe('Include files in results. Defaults to true.'),
  include_gitignored: z
    .boolean()
    .optional()
    .describe(
      'If true, includes files from gitignored paths (e.g. node_modules, dist). Defaults to false.',
    ),
});

export const listFilesToolOutputSchema = z.object({
  message: z.string(),
  result: z.object({
    files: z.array(z.any()),
    totalFiles: z.number().optional(),
    totalDirectories: z.number().optional(),
    truncated: z.boolean(),
    itemsRemoved: z.number().optional(),
  }),
});

export type ListFilesToolInput = z.infer<typeof listFilesToolInputSchema>;
export type ListFilesToolOutput = z.infer<typeof listFilesToolOutputSchema>;

export const listFilesToolSchema = {
  inputSchema: listFilesToolInputSchema,
  outputSchema: listFilesToolOutputSchema,
} as const;

export const grepSearchToolInputSchema = z.object({
  mount_prefix: z.string().describe('Mount prefix to use for the grep search.'),
  query: z
    .string()
    .describe(
      'Regex pattern using ripgrep syntax (similar to PCRE). Search for exact code strings or patterns.',
    ),
  case_sensitive: z
    .boolean()
    .optional()
    .describe(
      'Whether search is case sensitive. Defaults to false (case insensitive).',
    ),
  include_file_pattern: z
    .string()
    .optional()
    .describe(
      'Glob pattern for files to include. Examples: "*.ts", "**/*.tsx", "src/**/*.js".',
    ),
  exclude_file_pattern: z
    .string()
    .optional()
    .describe(
      'Glob pattern for files to exclude. Examples: "**/test-*.js", "metadata/**".',
    ),
  max_matches: z
    .number()
    .optional()
    .describe(
      'Maximum matches to return. Defaults to 15, maximum allowed is 50.',
    ),
  include_gitignored: z
    .boolean()
    .optional()
    .describe(
      'If true, includes files from gitignored paths (e.g. node_modules, dist). Use with specific patterns to avoid noise. Defaults to false.',
    ),
});

export const grepSearchToolOutputSchema = z.object({
  message: z.string(),
  result: z.object({
    totalMatches: z.number().optional(),
    filesSearched: z.number().optional(),
    matches: z.array(z.any()),
    truncated: z.boolean(),
    itemsRemoved: z.number().optional(),
  }),
});

export type GrepSearchToolInput = z.infer<typeof grepSearchToolInputSchema>;
export type GrepSearchToolOutput = z.infer<typeof grepSearchToolOutputSchema>;

export const grepSearchToolSchema = {
  inputSchema: grepSearchToolInputSchema,
  outputSchema: grepSearchToolOutputSchema,
} as const;

export const globToolInputSchema = z.object({
  mount_prefix: z.string().describe('Mount prefix to use for the glob search.'),
  pattern: z
    .string()
    .describe(
      "Glob pattern supporting standard syntax (*, **, ?, [abc]). Examples: '**/*.test.ts' for test files, 'src/**/config.json' for configs.",
    ),
  include_gitignored: z
    .boolean()
    .optional()
    .describe(
      'If true, includes files from gitignored paths (e.g. node_modules, dist). Use with specific patterns to avoid noise. Defaults to false.',
    ),
});

export const globToolOutputSchema = z.object({
  message: z.string(),
  result: z.object({
    totalMatches: z.number(),
    relativePaths: z.array(z.string()),
    truncated: z.boolean(),
    itemsRemoved: z.number(),
  }),
});

export type GlobToolInput = z.infer<typeof globToolInputSchema>;
export type GlobToolOutput = z.infer<typeof globToolOutputSchema>;

export const globToolSchema = {
  inputSchema: globToolInputSchema,
  outputSchema: globToolOutputSchema,
} as const;

const editSchema = z.object({
  old_string: z.string().describe('Text to find and replace.'),
  new_string: z.string().describe('Text to replace it with.'),
  replace_all: z
    .boolean()
    .optional()
    .describe(
      'If true, replaces all occurrences. If false (default), replaces only FIRST occurrence in current content.',
    ),
});

export const multiEditToolInputSchema = z.object({
  relative_path: z
    .string()
    .describe(
      'Relative file path to edit. File must exist. Must include a valid mount prefix. e.g. "ws1/path/to/file.ts" or "apps/my-app/index.html"',
    ),
  edits: z
    .array(editSchema)
    .min(1)
    .describe('Array of edit objects (minimum 1 edit).'),
});

export const multiEditToolOutputSchema = z.object({
  message: z.string(),
  result: z.object({
    editsApplied: z.number(),
  }),
});

export type MultiEditToolInput = z.infer<typeof multiEditToolInputSchema>;
export type MultiEditToolOutput = z.infer<typeof multiEditToolOutputSchema>;

export const multiEditToolSchema = {
  inputSchema: multiEditToolInputSchema,
  outputSchema: multiEditToolOutputSchema,
} as const;

export const deleteFileToolInputSchema = z.object({
  relative_path: z
    .string()
    .describe(
      'Relative file path to delete. Must be an existing file. Must include a valid mount prefix. e.g. "ws1/path/to/file.ts" or "apps/my-app/index.html"',
    ),
});

export const deleteFileToolOutputSchema = z.object({
  message: z.string(),
});

export type DeleteFileToolInput = z.infer<typeof deleteFileToolInputSchema>;
export type DeleteFileToolOutput = z.infer<typeof deleteFileToolOutputSchema>;

export const deleteFileToolSchema = {
  inputSchema: deleteFileToolInputSchema,
  outputSchema: deleteFileToolOutputSchema,
} as const;

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

// IMPORTANT: This definition is tied to a child agent - so the types are not strictly coupled. Change this type when you change the input schema of the @project-md.ts agent.
export const updateWorkspaceMdToolInputSchema = z.object({
  updateReason: z
    .string()
    .min(5)
    .describe(
      'Brief reason for triggering the .stagewise/WORKSPACE.md update.',
    ),
  mountPrefix: z.string().describe('Mount prefix of the workspace to update.'),
});

export const updateWorkspaceMdToolOutputSchema = z.object({
  message: z.string(),
});

export type UpdateWorkspaceMdToolInput = z.infer<
  typeof updateWorkspaceMdToolInputSchema
>;
export type UpdateWorkspaceMdToolOutput = z.infer<
  typeof updateWorkspaceMdToolOutputSchema
>;

export const updateWorkspaceMdToolSchema = {
  inputSchema: updateWorkspaceMdToolInputSchema,
  outputSchema: updateWorkspaceMdToolOutputSchema,
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

// ============================================================================
// Ask User Questions Tool
// ============================================================================

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

export const executeShellCommandToolInputSchema = z.object({
  explanation: z
    .string()
    .describe(
      'Concise (max 5 words) explanation of what this command does. Examples: "Install dependencies", "Check git status", "List project files", "Run test suite", "Build the project"',
    ),
  command: z.string().describe('Shell command to execute.'),
  mount_prefix: z
    .string()
    .optional()
    .describe(
      'Mount prefix whose workspace root is used as working directory. Falls back to the first mounted workspace.',
    ),
  timeout_ms: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Timeout in milliseconds. Defaults to 120000 (2 minutes).'),
});

export const executeShellCommandToolOutputSchema = z.object({
  message: z.string(),
  output: z.string(),
  stderr: z.string(),
  exit_code: z.number().nullable(),
  timed_out: z.boolean(),
  aborted: z.boolean(),
});

export type ExecuteShellCommandToolInput = z.infer<
  typeof executeShellCommandToolInputSchema
>;
export type ExecuteShellCommandToolOutput = z.infer<
  typeof executeShellCommandToolOutputSchema
>;

export const executeShellCommandToolSchema = {
  inputSchema: executeShellCommandToolInputSchema,
  outputSchema: executeShellCommandToolOutputSchema,
} as const;

/**
 * Combined schema definitions for all tools.
 * Used with InferUITools to derive TypeScript types.
 */
export const allToolSchemas = {
  overwriteFile: overwriteFileToolSchema,
  readFile: readFileToolSchema,
  listFiles: listFilesToolSchema,
  grepSearch: grepSearchToolSchema,
  glob: globToolSchema,
  multiEdit: multiEditToolSchema,
  deleteFile: deleteFileToolSchema,
  getLintingDiagnostics: getLintingDiagnosticsToolSchema,
  updateWorkspaceMd: updateWorkspaceMdToolSchema,
  executeSandboxJs: executeSandboxJsToolSchema,
  readConsoleLogs: readConsoleLogsToolSchema,
  listLibraryDocs: listLibraryDocsToolSchema,
  searchInLibraryDocs: searchInLibraryDocsToolSchema,
  askUserQuestions: askUserQuestionsToolSchema,
  executeShellCommand: executeShellCommandToolSchema,
} as const;
/**
 * Inferred UI types for all tools.
 * Use this type for type-safe tool rendering in the UI.
 */
export type UIAgentTools = InferUITools<AllTools>;

export type AllTools = typeof allToolSchemas;

export type StagewiseToolSet = {
  [K in keyof AllTools]: Tool<
    AllTools[K]['inputSchema'],
    AllTools[K]['outputSchema']
  >;
};

/**
 * Type helper for individual tool parts
 */
export type ToolName = keyof StagewiseToolSet;

/**
 * Diff data attached to file-modifying tool outputs for UI rendering.
 * Stripped before reaching the LLM via the underscore-prefix convention
 * in `convertStagewiseUIToModelMessages`.
 */
export interface ToolOutputDiff {
  /** File content before the edit. `null` means the file was created. */
  before: string | null;
  /** File content after the edit. `null` means the file was deleted. */
  after: string | null;
}

/**
 * Helper type to add optional `_diff` metadata to a tool output type.
 * Use in UI components to safely access diff data from tool outputs.
 */
export type WithDiff<T> = T & { _diff?: ToolOutputDiff | null };
