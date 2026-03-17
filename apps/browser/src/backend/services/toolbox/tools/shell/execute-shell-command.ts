import {
  type ExecuteShellCommandToolInput,
  executeShellCommandToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import { capToolOutput } from '../../utils';
import type { ShellService } from '@/services/toolbox/services/shell';
import { homedir } from 'node:os';

export const DESCRIPTION = `Execute a shell command in the user's system shell.

Parameters:
- explanation (string, REQUIRED): Concise (max 5 words) human-readable description of what this command does. Examples: "Install dependencies", "Check git status", "List project files".
- command (string, REQUIRED): The shell command to execute.
- mount_prefix (string, OPTIONAL): Mount prefix whose workspace root is used as the working directory. Falls back to the first mounted workspace, or the user's home directory.
- timeout_ms (number, OPTIONAL): Timeout in milliseconds. Defaults to 120000 (2 minutes).
`;

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
    needsApproval: true,
    execute: async (
      params: ExecuteShellCommandToolInput,
      { toolCallId, abortSignal },
    ) => {
      try {
        const cwd = resolveCwd(params.mount_prefix, getMountedPaths);
        const result = await shellService.execute(agentInstanceId, toolCallId, {
          command: params.command,
          cwd,
          timeoutMs: params.timeout_ms,
          abortSignal,
        });

        const message = result.aborted
          ? 'Shell execution was cancelled.'
          : result.timedOut
            ? 'Shell execution timed out.'
            : `Command exited with code ${result.exitCode}`;

        return {
          message,
          output: capToolOutput(result.output).result,
          stderr: capToolOutput(result.stderr).result,
          exit_code: result.exitCode,
          timed_out: result.timedOut,
          aborted: result.aborted,
        };
      } finally {
        shellService.clearPendingOutputs(agentInstanceId, toolCallId);
      }
    },
  });
};
