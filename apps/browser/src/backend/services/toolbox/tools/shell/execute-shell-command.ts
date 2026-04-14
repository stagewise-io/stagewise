import {
  type ExecuteShellCommandToolInput,
  executeShellCommandToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import { capToolOutput } from '../../utils';
import type { ShellService } from '@/services/toolbox/services/shell';
import { homedir } from 'node:os';

export const DESCRIPTION = `Execute a shell command in the user's system shell. You **MUST** define a symlinked path (NOT "."!) as initial cwd for the command to run in.`;

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
        // Kill mode — terminate session immediately
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
