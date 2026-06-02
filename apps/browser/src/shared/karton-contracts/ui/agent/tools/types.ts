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

export const createShellSessionToolInputSchema = z.object({
  cwd: z
    .string()
    .describe(
      'Mount prefix for the initial working directory. Must be a mount prefix from the environment snapshot (e.g. "wXXXX" or "wXXXX/apps/browser"), never ".".',
    ),
});

export const createShellSessionToolOutputSchema = z.object({
  session_id: z.string(),
  message: z.string(),
});

export type CreateShellSessionToolInput = z.infer<
  typeof createShellSessionToolInputSchema
>;
export type CreateShellSessionToolOutput = z.infer<
  typeof createShellSessionToolOutputSchema
>;

export const createShellSessionToolSchema = {
  inputSchema: createShellSessionToolInputSchema,
  outputSchema: createShellSessionToolOutputSchema,
} as const;

// ============================================================================
// Execute Shell Command Tool (session input)
// ============================================================================

export const executeShellCommandToolInputSchema = z.object({
  explanation: z
    .string()
    .describe(
      'Required on every call. Concise (<= 5 words) summary of what this call does. Examples: "Install dependencies", "Poll running build", "Interrupt process", "Send Enter key", "Kill dev server". Include this even on polling, stdin, and kill follow-ups.',
    ),
  command: z
    .string()
    .optional()
    .describe('The command to run. Required unless kill is true.'),
  session_id: z
    .string()
    .describe(
      'Session ID returned by createShellSession. Required — use createShellSession first if no session exists yet.',
    ),
  stdin: z
    .string()
    .optional()
    .describe(
      'Raw bytes to write to the PTY. No \\r is appended — include it explicitly if needed. ' +
        'Mutually exclusive with `command` and `kill`. Requires `session_id`. ' +
        'Supports `wait_until` for output capture (default timeout: 5s without wait_until). ' +
        'Common sequences: "\\x03" (Ctrl+C / interrupt), "\\x1b[A" (Up), "\\x1b[B" (Down), ' +
        '"\\x1b[C" (Right), "\\x1b[D" (Left), "\\x1b" (Escape), "\\t" (Tab), "\\r" (Enter), ' +
        '"y\\r" (type y + Enter).',
    ),
  kill: z
    .boolean()
    .optional()
    .describe(
      'Hard-kill the session. Mutually exclusive with command and stdin.',
    ),
  wait_until: z
    .object({
      timeout_ms: z
        .number()
        .int()
        .positive()
        .max(300_000)
        .optional()
        .describe(
          'Hard timeout in ms. Shape: any positive integer up to 300000. Enforcement: backend clamps to 60000 without `exited: true`, 300000 with `exited: true`. Defaults: 10000 without wait_until, 15000 with wait_until (non-exited), 300000 with `exited: true`. Omit this field unless you specifically need to change the default.',
        ),
      exited: z
        .boolean()
        .optional()
        .describe(
          'Strong signal that the command will terminate on its own (builds, typechecks, tests, installs, git). Raises hard cap to 5 min (300000ms) and idle threshold to 15000ms. Use this for any long self-exiting command instead of a custom timeout_ms.',
        ),
      output_pattern: z
        .string()
        .optional()
        .describe(
          'Return early when stdout/stderr matches this regex. Use for dev servers and watchers that never exit.',
        ),
      idle_ms: z
        .number()
        .int()
        .min(0)
        .max(60_000)
        .optional()
        .describe(
          'Silence threshold in ms after first output (max 60000). Defaults: 5000 normally, 15000 with `exited: true`. 0 disables idle detection — avoid unless the command has proven long silent phases during active work; prefer `output_pattern` instead.',
        ),
    })
    .superRefine((val, ctx) => {
      if (
        val.timeout_ms !== undefined &&
        val.timeout_ms > 60_000 &&
        !val.exited
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['timeout_ms'],
          message:
            'timeout_ms > 60000 requires `exited: true`. Either set `exited: true` for a long self-exiting command, or use a smaller timeout_ms.',
        });
      }
    })
    .optional()
    .describe('Controls when the tool returns.'),
});

export const executeShellCommandToolOutputSchema = z.object({
  session_id: z.string().nullable(),
  output: z.string(),
  recent_output: z
    .string()
    .optional()
    .describe('Recent character-capped tail of the full session log.'),
  exit_code: z.number().nullable(),
  session_exited: z.boolean(),
  timed_out: z.boolean(),
  resolved_by: z
    .enum(['exit', 'pattern', 'idle', 'timeout', 'abort', 'session_exited'])
    .optional()
    .describe(
      'Why the tool resolved. Absent only for payloads persisted by earlier versions before this field existed; the backend always produces it.',
    ),
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

export const allToolSchemas = {
  ...universalToolSchemas,
  getLintingDiagnostics: getLintingDiagnosticsToolSchema,
  updateWorkspaceMd: updateWorkspaceMdToolSchema,
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
