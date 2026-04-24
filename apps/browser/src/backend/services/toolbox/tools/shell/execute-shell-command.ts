import {
  type ExecuteShellCommandToolInput,
  executeShellCommandToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import { capToolOutput } from '../../utils';
import type { ShellService } from '@/services/toolbox/services/shell';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

export const DESCRIPTION = `Execute a shell command in the user's system shell. Initial \`cwd\` MUST be a mount prefix from the environment snapshot (e.g. "wXXXX" or "wXXXX/apps/browser"), never ".".

## Required parameters on every call

- \`explanation\` — always required. Include it on first calls, polls, stdin, and kill. Omitting it causes a schema error.

## Snapshot model

Returns within ~15s. Does NOT block until the command finishes — the returned \`output\` is whatever was produced so far. The full session log is persisted to \`shells/<session_id>.shell.log\` and can be re-read with the \`read\` tool.

## resolved_by values

- \`exit\` — command finished cleanly. \`exit_code\` is set.
- \`pattern\` — \`wait_until.output_pattern\` matched. Still running.
- \`idle\` — no output for the idle window (default 5000ms). Usually waiting for input.
- \`timeout\` — hard timeout. Still running.
- \`abort\` — user cancelled.
- \`session_exited\` — shell itself died.

## Follow-up pattern

When \`resolved_by\` is \`idle\`, \`pattern\`, or \`timeout\`, the command is still running. Use the same \`session_id\` to:

- Send stdin to answer prompts: \`{ explanation, session_id, stdin: "y\\r" }\`. \`command\` is NOT required here.
- Poll for more output: \`{ explanation, session_id, command: "" }\`.
- Kill the session: \`{ explanation, session_id, kill: true }\`.

\`explanation\` stays required in every follow-up shape.

## Parameter guidance (read before setting wait_until)

Defaults are correct for installs, builds, git, tests, and interactive prompts — idle detection is how interactive prompts are detected. Only set \`wait_until\` when you have a specific reason.

- Do NOT set \`wait_until.idle_ms: 0\` defensively. It disables the mechanism that catches stuck/interactive commands. Only use it for commands with proven long silent phases *during active work* (e.g. a dev server that pauses between startup log lines).
- Do NOT raise \`wait_until.timeout_ms\` above 30000 unless the command genuinely needs it. Longer timeouts do not make commands finish sooner; follow-up calls are cheap.
- \`wait_until: { exited: true }\` alone is complete — it doesn't need to be combined with other overrides.

## Schema summary

- \`explanation\` (string, required) — short human-readable summary.
- \`command\` (string) — required on first call and on polls; omit when sending \`stdin\` or \`kill\`.
- \`cwd\` (string, mount prefix) — only used on new sessions.
- \`session_id\` (string) — reuse an existing session. Omit to create one.
- \`stdin\` (string) — raw bytes to write to the PTY. Mutually exclusive with \`command\` and \`kill\`. Requires \`session_id\`. Common: "\\x03" (Ctrl+C), "\\x1b[A" (Up), "\\r" (Enter), "y\\r" (type y + Enter).
- \`kill: true\` — hard-kill the session. Requires \`session_id\`. Mutually exclusive with \`command\` and \`stdin\`.
- \`wait_until\` (object, optional) — \`{ timeout_ms?, idle_ms?, output_pattern?, exited? }\`.`;

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
