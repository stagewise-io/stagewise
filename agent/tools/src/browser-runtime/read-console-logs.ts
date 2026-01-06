import { z } from 'zod';
import { tool } from 'ai';
import { rethrowCappedToolOutputError } from '../utils/error';
import { capToolOutput } from '../utils/tool-output-capper';
import { TOOL_OUTPUT_LIMITS } from '../constants';
import type { BrowserRuntime } from '..';

export const DESCRIPTION = `Read console logs from a browser tab. Returns logs captured since the page loaded (logs are cleared on navigation).

Use cases:
1. DEBUG RUNTIME ERRORS - Check for JavaScript errors, exceptions, and stack traces
2. INSPECT APPLICATION STATE - View console.log outputs from the user's application
3. MONITOR NETWORK/API ISSUES - See logged warnings about failed requests
4. VERIFY CODE CHANGES - Confirm that changes you made are working (or find errors)
5. ANALYZE ANIMATIONS & ASYNC BEHAVIOR - Use with delayMs to capture logs from monitoring code

## Analyzing Animations (delayMs parameter)

Since executeConsoleScript only runs synchronous code, you cannot directly observe animations or async behavior. However, you can use a two-step approach:

1. First, use executeConsoleScript to INJECT monitoring code that logs values over time:
   \`\`\`javascript
   const el = document.querySelector('.animated-element');
   let frame = 0;
   const interval = setInterval(() => {
     const s = getComputedStyle(el);
     console.log('ANIM_DEBUG:', JSON.stringify({
       frame: frame++,
       transform: s.transform,
       opacity: s.opacity
     }));
     if (frame >= 10) clearInterval(interval);
   }, 50);
   'Monitoring started'
   \`\`\`

2. Then, call readConsoleLogs with delayMs to wait for logs to be captured:
   \`\`\`
   readConsoleLogs({ id: "t_1", delayMs: 600, filter: "ANIM_DEBUG" })
   \`\`\`

The delayMs parameter makes the tool wait BEFORE reading logs, giving time for:
- CSS animations/transitions to run
- setInterval/setTimeout callbacks to execute
- requestAnimationFrame loops to capture frames
- Network requests to complete and log results

Parameters:
- id (string, REQUIRED): The tab ID to read logs from. Use the tab ID from browser-information in the system prompt.
- filter (string, OPTIONAL): Case-insensitive substring to filter logs by. Only logs containing this string will be returned.
- limit (number, OPTIONAL): Maximum number of logs to return (most recent first). Default: 50.
- levels (array, OPTIONAL): Filter by log levels. Options: "log", "debug", "info", "error", "warning", "trace". Default: all levels.
- delayMs (number, OPTIONAL): Milliseconds to wait BEFORE reading logs. Use this after injecting monitoring code with executeConsoleScript. Max: 5000ms. Default: 0 (no delay).

Returns logs in reverse chronological order (most recent first) with:
- timestamp: When the log was captured
- level: The log level (log, error, warning, etc.)
- message: The stringified log content
- pageUrl: The URL when the log was captured
- stackTrace: Stack trace (for errors)
`;

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

export interface ConsoleLogEntry {
  timestamp: number;
  level: ConsoleLogLevel;
  message: string;
  pageUrl: string;
  stackTrace?: string;
}

export type BrowserLogsRuntime = {
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

export const readConsoleLogsParamsSchema = z.object({
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
    .default(50)
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
    .default(0)
    .describe(
      'Milliseconds to wait BEFORE reading logs. Use after injecting monitoring code to capture async/animation logs.',
    ),
});

export type ReadConsoleLogsParams = z.infer<typeof readConsoleLogsParamsSchema>;

export const readConsoleLogsTool = (runtime: BrowserRuntime) => {
  return tool({
    description: DESCRIPTION,
    inputSchema: readConsoleLogsParamsSchema,
    execute: (params: ReadConsoleLogsParams) =>
      readConsoleLogsToolExecute(params, runtime),
  });
};

async function readConsoleLogsToolExecute(
  params: ReadConsoleLogsParams,
  runtime: BrowserLogsRuntime,
) {
  try {
    // Wait for the specified delay before reading logs
    // This allows async code (animations, timers, network) to execute and log
    const delayMs = params.delayMs ?? 0;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const result = runtime.getConsoleLogs(params.id, {
      filter: params.filter,
      limit: params.limit,
      levels: params.levels,
    });

    if (!result.success) {
      return {
        message: 'Failed to read console logs',
        error: result.error,
      };
    }

    const logs = result.logs ?? [];
    const totalCount = result.totalCount ?? 0;

    // Format logs for output
    const formattedLogs = logs.map((log) => ({
      time: new Date(log.timestamp).toISOString(),
      level: log.level,
      message: log.message,
      ...(log.stackTrace ? { stackTrace: log.stackTrace } : {}),
    }));

    const output = JSON.stringify(
      {
        logsReturned: logs.length,
        totalLogsStored: totalCount,
        filter: params.filter || null,
        levels: params.levels || 'all',
        delayMs: delayMs > 0 ? delayMs : null,
        logs: formattedLogs,
      },
      null,
      2,
    );

    const delayNote = delayMs > 0 ? ` (after ${delayMs}ms delay)` : '';
    return {
      message:
        logs.length > 0
          ? `Found ${logs.length} console log(s)${params.filter ? ` matching "${params.filter}"` : ''}${delayNote} (${totalCount} total stored)`
          : `No console logs found${params.filter ? ` matching "${params.filter}"` : ''}${delayNote} (${totalCount} total stored)`,
      result: capToolOutput(output, {
        maxBytes:
          TOOL_OUTPUT_LIMITS.EXECUTE_CONSOLE_SCRIPT.MAX_TOTAL_OUTPUT_SIZE,
      }),
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}
