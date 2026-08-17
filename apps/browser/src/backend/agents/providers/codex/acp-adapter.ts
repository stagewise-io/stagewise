import {
  resolveAgentExecutable,
  resolveBundledAdapterLaunch,
  type AcpAdapter,
} from '../../acp/adapter';

export const codexAcpAdapter: AcpAdapter = {
  id: 'codex',
  displayName: 'Codex',
  resolveLaunch(node) {
    return resolveBundledAdapterLaunch(
      node,
      'codex-acp.mjs',
      '@agentclientprotocol/codex-acp',
    );
  },
  async environment(env) {
    const codex = await resolveAgentExecutable('codex', env);
    if (!codex) {
      throw new Error(
        'Codex is not installed. Install Codex CLI and run `codex login` first.',
      );
    }
    return { ...env, CODEX_PATH: codex };
  },
  sessionModeForApproval(approvalMode) {
    return approvalMode === 'alwaysAsk' ? 'read-only' : 'agent';
  },
};
