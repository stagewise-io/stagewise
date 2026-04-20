import {
  type ExecuteShellCommandToolInput,
  executeShellCommandToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import { capToolOutput } from '../../utils';
import type { ShellService } from '@/services/toolbox/services/shell';
import { homedir } from 'node:os';

export const DESCRIPTION = `Execute a shell command in the user's system shell. You **MUST** define a symlinked path (NOT "."!) as initial cwd for the command to run in.`;

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
    const resolved = mounts.get(mountPrefix);
    if (resolved) return resolved;
  }

  for (const [prefix, path] of mounts) {
    if (prefix !== 'att') return path;
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
            };
          }
          if (!params.session_id) {
            return {
              session_id: null,
              output: 'stdin requires a session_id.',
              exit_code: null,
              session_exited: false,
              timed_out: false,
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
        };
      } finally {
        shellService.clearPendingOutputs(agentInstanceId, toolCallId);
      }
    },
  });
};
