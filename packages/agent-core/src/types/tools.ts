import type { InferSchema, InferUITools, Tool } from 'ai';
import { z } from 'zod';

export const writeToolInputSchema = z.object({
  path: z
    .string()
    .describe(
      'File path to write to. Must include a valid mount prefix. (e.g. "ws1/path/to/file.ts", "apps/my-app/index.html")',
    ),
  content: z.string().describe('New content for the file'),
});

export const writeToolOutputSchema = z.object({
  message: z.string(),
});

export type WriteToolInput = z.infer<typeof writeToolInputSchema>;
export type WriteToolOutput = z.infer<typeof writeToolOutputSchema>;

export const writeToolSchema = {
  inputSchema: writeToolInputSchema,
  outputSchema: writeToolOutputSchema,
} as const;

export const readToolInputSchema = z.object({
  path: z
    .string()
    .describe(
      'Path of file to read. Must include a valid mount prefix (e.g. "ws1/path/to/file.ts", "apps/my-app/index.html", "att/screens-j8943f.webp"). For directories, use ls instead.',
    ),
  start_line: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Starting line number (1-indexed, INCLUSIVE). Must be >= 1. Omit to read from beginning. Ignored in binary-format files.',
    ),
  end_line: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Ending line number (1-indexed, INCLUSIVE). Must be >= start_line. Omit to read to end. Ignored in binary-format files.',
    ),
  start_page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Starting page number (1-indexed, INCLUSIVE). Must be >= 1. Omit to read from beginning. Ignored in non-paginated content.',
    ),
  end_page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Ending page number (1-indexed, INCLUSIVE). Must be >= start_page. Omit to read to end. Ignored in non-paginated content.',
    ),
  preview: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      'Only request a short preview of the file structure and heavily truncated content instead of full content. For source code, returns an AST symbol outline (functions, classes, signatures, line numbers). For markdown, returns a heading outline. Small files are auto-promoted to full content.',
    ),
});

export type readToolInput = z.infer<typeof readToolInputSchema>;

export const readToolOutputSchema = z.object({
  message: z.string(),
});

export type ReadToolOutput = z.infer<typeof readToolOutputSchema>;

export const readToolSchema = {
  inputSchema: readToolInputSchema,
  outputSchema: readToolOutputSchema,
} as const;

export const lsToolInputSchema = z.object({
  path: z
    .string()
    .describe(
      'Path of directory to list. Must include a valid mount prefix (e.g. "ws1/src", "apps/my-app"). For reading file contents, use read instead.',
    ),
  depth: z
    .number()
    .min(0)
    .optional()
    .describe(
      'Maximum directory depth to list. Defaults to 0 (immediate children only).',
    ),
});

export type LsToolInput = z.infer<typeof lsToolInputSchema>;

export const lsToolSchema = {
  inputSchema: lsToolInputSchema,
  outputSchema: z.void(),
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
  path: z
    .string()
    .describe(
      'Path to file to be edited. Must include a valid mount prefix. (e.g. "ws1/path/to/file.ts", "apps/my-app/index.html")',
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

export const deleteToolInputSchema = z.object({
  path: z
    .string()
    .describe(
      'File/Directory to delete. Must include a valid mount prefix. (e.g. "ws1/path/to/file.ts", "apps/my-app/index.html")',
    ),
});

export type DeleteToolInput = z.infer<typeof deleteToolInputSchema>;

export const deleteToolOutputSchema = z.record(z.string(), z.unknown());

export type DeleteToolOutput = z.infer<typeof deleteToolOutputSchema>;

export const deleteToolSchema = {
  inputSchema: deleteToolInputSchema,
  outputSchema: deleteToolOutputSchema,
} as const;

export const mkdirToolInputSchema = z.object({
  path: z
    .string()
    .describe(
      'Directory path to create. Must include a valid mount prefix. (e.g. "w1/src/components/new-dir", "apps/my-app/assets"). Parent directories are created automatically.',
    ),
});

export const mkdirToolOutputSchema = z.object({
  message: z.string(),
});

export type MkdirToolInput = z.infer<typeof mkdirToolInputSchema>;
export type MkdirToolOutput = z.infer<typeof mkdirToolOutputSchema>;

export const mkdirToolSchema = {
  inputSchema: mkdirToolInputSchema,
  outputSchema: mkdirToolOutputSchema,
} as const;

export const copyToolInputSchema = z.object({
  input_path: z
    .string()
    .describe(
      'Source file or directory path to copy/move. Must include a valid mount prefix (e.g. "w1/src/utils.ts", "w1/src/components").',
    ),
  output_path: z
    .string()
    .describe(
      'Target file or directory path. Must include a valid mount prefix (e.g. "w1/src/lib/utils.ts", "w1/src/new-components"). Cannot copy a directory into a file.',
    ),
  move: z
    .boolean()
    .describe(
      'If true, moves the file/directory instead of copying it (deletes the source after copying).',
    ),
});

export const copyToolOutputSchema = z.object({
  message: z.string(),
});

export type CopyToolInput = z.infer<typeof copyToolInputSchema>;
export type CopyToolOutput = z.infer<typeof copyToolOutputSchema>;

export const copyToolSchema = {
  inputSchema: copyToolInputSchema,
  outputSchema: copyToolOutputSchema,
} as const;

export const universalToolSchemas = {
  write: writeToolSchema,
  read: readToolSchema,
  ls: lsToolSchema,
  mkdir: mkdirToolSchema,
  copy: copyToolSchema,
  grepSearch: grepSearchToolSchema,
  glob: globToolSchema,
  multiEdit: multiEditToolSchema,
  delete: deleteToolSchema,
} as const;

export type UniversalToolSchemas = typeof universalToolSchemas;
export type UniversalTools = InferUITools<UniversalToolSchemas>;

export type StagewiseToolSet<TToolSchemas extends Record<string, any>> = {
  [K in keyof TToolSchemas]: TToolSchemas[K] extends {
    inputSchema: infer TInput;
    outputSchema: infer TOutput;
  }
    ? Tool<InferSchema<TInput>, InferSchema<TOutput>>
    : never;
};

export type ToolName<TToolSet extends Record<string, unknown>> = keyof TToolSet;

/**
 * Diff data attached to file-modifying tool outputs for UI rendering.
 * Stripped before reaching the LLM via the underscore-prefix convention.
 */
export interface ToolOutputDiff {
  /** File content before the edit. `null` means the file was created. */
  before: string | null;
  /** File content after the edit. `null` means the file was deleted. */
  after: string | null;
}

/** Helper type to add optional `_diff` metadata to a tool output type. */
export type WithDiff<T> = T & { _diff?: ToolOutputDiff | null };
