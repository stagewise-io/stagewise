/**
 * Pure (no `node-pty`) schema surface for the shell package. Importable by
 * UI code and host contracts as well as the Node engine/tools. Contains:
 *
 * - The two shell tool input/output zod schemas + inferred types.
 * - The shell session manifest snapshot schemas + inferred types.
 */
import { z } from 'zod';

// ============================================================================
// Create Shell Session Tool
// ============================================================================

export const createShellSessionToolInputSchema = z.object({
  cwd: z
    .string()
    .refine((v) => v !== '.', {
      message:
        'cwd must be a mount prefix from the environment snapshot, not ".".',
    })
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

export const executeShellCommandToolInputSchema = z
  .object({
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
  })
  .superRefine((val, ctx) => {
    // Mirror the runtime guards in `executeShellCommand`: `command`,
    // `stdin`, and `kill` are mutually exclusive action modes. `command`
    // stays optional so an empty/omitted command is a valid poll.
    const hasCommand =
      typeof val.command === 'string' && val.command.length > 0;
    const hasStdin = val.stdin !== undefined;
    const isKill = val.kill === true;

    if (hasStdin && (hasCommand || isKill)) {
      ctx.addIssue({
        code: 'custom',
        path: ['stdin'],
        message: 'stdin is mutually exclusive with command and kill.',
      });
    }
    if (isKill && hasCommand) {
      ctx.addIssue({
        code: 'custom',
        path: ['kill'],
        message: 'kill is mutually exclusive with command.',
      });
    }
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

// ============================================================================
// Shell session manifest snapshot
// ============================================================================

export const shellSessionSnapshotSchema = z.object({
  id: z.string(),
  exited: z.boolean(),
  exitCode: z.number().nullable(),
  lineCount: z.number(),
  logPath: z.string(),
  tailContent: z.string().optional(),
  lastLine: z.string().optional(),
  cwd: z.string(),
  createdAt: z.number(),
});
export type ShellSessionSnapshot = z.infer<typeof shellSessionSnapshotSchema>;

export const shellSnapshotSchema = z.object({
  sessions: z.array(shellSessionSnapshotSchema),
});
export type ShellSnapshot = z.infer<typeof shellSnapshotSchema>;
