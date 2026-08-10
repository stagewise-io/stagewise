import { homedir } from 'node:os';
import nodePath from 'node:path';
import {
  resolveAgentExecutable,
  resolveBundledAdapterLaunch,
  type AcpAdapter,
} from '../../acp/adapter';

export const claudeCodeAcpAdapter: AcpAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',
  minimumNodeMajor: 22,
  resolveLaunch(node) {
    return resolveBundledAdapterLaunch(
      node,
      'claude-agent-acp.mjs',
      '@agentclientprotocol/claude-agent-acp/dist/index.js',
    );
  },
  async environment(env) {
    const claude = await resolveAgentExecutable('claude', env);
    if (!claude) {
      throw new Error(
        'Claude Code is not installed. Install it and run `claude` to sign in first.',
      );
    }
    return { ...env, CLAUDE_CODE_EXECUTABLE: claude };
  },
  processKeyForApproval(approvalMode) {
    return approvalMode;
  },
  restartAfterCancel: true,
  hiddenToolNames: ['EnterPlanMode', 'ExitPlanMode', 'ToolSearch'],
  hiddenToolPathPrefixes: [nodePath.join(homedir(), '.claude', 'plans')],
  newSessionMeta(approvalMode) {
    if (approvalMode !== 'alwaysAsk') return;
    return {
      claudeCode: {
        options: {
          settings: {
            permissions: {
              ask: ['Bash(*)'],
              defaultMode: 'default',
            },
          },
        },
      },
    };
  },
};
