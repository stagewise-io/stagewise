import type { Logger } from '@/services/logger';

export async function resolveNewAgentWorkspaceMountPath(
  workspacePath: string,
  getMainWorktreePath: (workspacePath: string) => Promise<string | null>,
  logger?: Pick<Logger, 'warn'>,
): Promise<string> {
  try {
    return (await getMainWorktreePath(workspacePath)) ?? workspacePath;
  } catch (error) {
    logger?.warn(
      `[AgentManager] Failed to resolve main worktree for workspace ${workspacePath}`,
      { error },
    );
    return workspacePath;
  }
}
