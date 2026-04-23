import {
  type ExecuteShellCommandToolInput,
  executeShellCommandToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import { capToolOutput } from '../../utils';
import type { ShellService } from '@/services/toolbox/services/shell';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

export const DESCRIPTION = `Execute a shell command in the user's system shell. You **MUST** define a symlinked path (NOT "."!) as initial cwd for the command to run in.

## Snapshot model

This tool returns within 15 seconds max — it does NOT block until the command finishes. What you get is a snapshot of output produced so far. Every call's full output is persisted to \`shells/<session_id>.shell.log\` for later inspection.

## How resolution works

The tool resolves via the first of these that fires, reported in the \`resolved_by\` field:

- \`exit\` — command finished cleanly. \`exit_code\` is set.
- \`pattern\` — \`wait_until.output_pattern\` matched. \`exit_code\` is null, command is still running.
- \`idle\` — no output for 5s (3s with \`exited: true\`) after the first output event. Usually means the command is waiting for input.
- \`timeout\` — hard timeout. Command is still running, just hasn't produced output yet.
- \`abort\` — user cancelled.
- \`session_exited\` — the shell itself died.

## Follow-up pattern

When \`resolved_by\` is \`idle\`, \`pattern\`, or \`timeout\`, the command is still running. You can:

- Send stdin to the same \`session_id\` (e.g. \`y\\r\` to confirm a prompt, arrow keys to navigate a menu).
- Read \`shells/<session_id>.shell.log\` to see the latest output without running a new command.
- Make another tool call on the same \`session_id\` with an empty \`command\` to just poll for more output.
- Kill the session with \`kill: true\` if you're done.

## Parameter guidance

**Omit \`wait_until\` for most commands.** The defaults (10s hard cap, 5s idle after first output) are correct for installs, builds, git, tests, AND interactive prompts. Idle detection fires when a command stops producing output — which is exactly how an interactive prompt (npx create-*, inquirer menus, confirm dialogs) is detected. You should reach for \`wait_until\` only when you have a specific reason.

**Avoid \`wait_until.idle_ms: 0\`.** This disables the primary mechanism that catches stuck/interactive commands. It is ONLY correct when the command has proven long silent phases *during active work* (e.g. a dev server that pauses between startup log lines). Using it defensively on normal commands — including interactive CLIs — will produce long hangs followed by \`resolved_by: 'timeout'\`, defeating the whole point of this tool.

**Avoid raising \`timeout_ms\` above 30000.** The 60s max is a ceiling, not a target. Raising the timeout does not help commands complete faster; it just blocks you. For long-running work, use follow-up calls — the full output is preserved in \`shells/<session_id>.shell.log\` and can be re-read at any time.

**\`wait_until.exited: true\`** is a minor hint (shortens idle to 3s for snappier prompt detection). It does NOT need to be combined with other overrides — \`wait_until: { exited: true }\` alone is complete.`;

/**
 * Expand C-style escape sequences into real bytes.
 *
 * LLMs frequently double-escape: the JSON arrives with literal `\r`
 * (two chars: backslash + r) instead of a real CR byte.  `JSON.parse`
 * only resolves single-escaped sequences, so anything that remains
 * as a backslash pair after parsing needs translation here.
 *
 * No double-conversion risk: if JSON.parse already resolved `\r` to
 * byte 0x0D, the regex (which matches literal backslash + letter)
 * simply won't match a lone 0x0D character.
 */
const C_ESCAPE_MAP: Record<string, string> = {
  r: '\r',
  n: '\n',
  t: '\t',
  a: '\x07',
  b: '\b',
  '\\': '\\',
};

function expandCEscapes(s: string): string {
  return s.replace(
    /\\(x[0-9a-fA-F]{2}|r|n|t|a|b|\\)/g,
    (match, seq: string) => {
      if (seq.startsWith('x'))
        return String.fromCharCode(Number.parseInt(seq.slice(1), 16));

      return C_ESCAPE_MAP[seq] ?? match;
    },
  );
}

type MountedPathsGetter = () => Map<string, string>;

function resolveCwd(
  mountPrefix: string | undefined,
  getMountedPaths: MountedPathsGetter,
): string {
  const mounts = getMountedPaths();

  if (mountPrefix) {
    // Split "weba9/apps/browser" into prefix "weba9" + rest "apps/browser"
    const slashIdx = mountPrefix.indexOf('/');
    const prefix =
      slashIdx === -1 ? mountPrefix : mountPrefix.slice(0, slashIdx);
    const rest = slashIdx === -1 ? '' : mountPrefix.slice(slashIdx + 1);

    const mountRoot = mounts.get(prefix);
    if (mountRoot) {
      if (!rest) return mountRoot;
      const full = resolve(join(mountRoot, rest));
      // Prevent traversal outside the mount root
      if (full === mountRoot || full.startsWith(`${mountRoot}${sep}`))
        return full;
      return mountRoot;
    }
  }

  for (const [prefix, fsPath] of mounts) {
    if (prefix !== 'att') return fsPath;
  }

  return homedir();
}

export const executeShellCommand = (
  shellService: ShellService,
  agentInstanceId: string,
  getMountedPaths: MountedPathsGetter,
) => {
  return tool({
    description: DESCRIPTION,
    inputSchema: executeShellCommandToolInputSchema,
    strict: false,
    needsApproval: true,
    execute: async (
      params: ExecuteShellCommandToolInput,
      { toolCallId, abortSignal },
    ) => {
      try {
        // Stdin mode — write raw bytes, capture output
        if (params.stdin !== undefined) {
          if (params.command || params.kill) {
            return {
              session_id: params.session_id ?? null,
              output: 'stdin is mutually exclusive with command and kill.',
              exit_code: null,
              session_exited: false,
              timed_out: false,
              resolved_by: 'abort' as const,
            };
          }
          if (!params.session_id) {
            return {
              session_id: null,
              output: 'stdin requires a session_id.',
              exit_code: null,
              session_exited: false,
              timed_out: false,
              resolved_by: 'abort' as const,
            };
          }
          const cwd = resolveCwd(params.cwd, getMountedPaths);
          const expandedStdin = expandCEscapes(params.stdin);
          const result = await shellService.executeInSession(
            agentInstanceId,
            toolCallId,
            {
              command: expandedStdin,
              cwd,
              sessionId: params.session_id,
              rawInput: true,
              waitUntil: params.wait_until
                ? {
                    timeoutMs: params.wait_until.timeout_ms,
                    exited: params.wait_until.exited,
                    outputPattern: params.wait_until.output_pattern,
                    idleMs: params.wait_until.idle_ms,
                  }
                : undefined,
              abortSignal,
            },
          );
          const capped = capToolOutput(result.output);
          return {
            session_id: result.sessionId,
            output: capped.result,
            exit_code: result.exitCode,
            session_exited: result.sessionExited,
            timed_out: result.timedOut,
            resolved_by: result.resolvedBy,
          };
        }

        // Kill mode — terminate session immediately
        if (params.kill && !params.session_id) {
          return {
            session_id: null,
            output: 'kill requires a session_id.',
            exit_code: null,
            session_exited: false,
            timed_out: false,
            resolved_by: 'abort' as const,
          };
        }
        if (params.kill && params.session_id) {
          const killed = shellService.killSession(params.session_id);
          return {
            session_id: params.session_id,
            output: killed
              ? 'Session killed.'
              : 'Session not found (may have already exited).',
            exit_code: null,
            session_exited: true,
            timed_out: false,
            resolved_by: 'session_exited' as const,
          };
        }

        const cwd = resolveCwd(params.cwd, getMountedPaths);
        const result = await shellService.executeInSession(
          agentInstanceId,
          toolCallId,
          {
            command: params.command ?? '',
            cwd,
            sessionId: params.session_id,
            waitUntil: params.wait_until
              ? {
                  timeoutMs: params.wait_until.timeout_ms,
                  exited: params.wait_until.exited,
                  outputPattern: params.wait_until.output_pattern,
                  idleMs: params.wait_until.idle_ms,
                }
              : undefined,
            abortSignal,
          },
        );

        return {
          session_id: result.sessionId,
          output: capToolOutput(result.output).result,
          exit_code: result.exitCode,
          session_exited: result.sessionExited,
          timed_out: result.timedOut,
          resolved_by: result.resolvedBy,
        };
      } finally {
        shellService.clearPendingOutputs(agentInstanceId, toolCallId);
      }
    },
  });
};
