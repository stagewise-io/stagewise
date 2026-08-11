import { resolveAgentExecutable, type AcpAdapter } from '../../acp/adapter';
import { normalizeOpenCodeTool } from './tool-normalizer';

export const openCodeAcpAdapter: AcpAdapter = {
  id: 'opencode',
  displayName: 'OpenCode',
  async resolveLaunch(_node, env) {
    const executable = await resolveAgentExecutable('opencode', env);
    if (!executable) {
      throw new Error(
        'OpenCode is not installed. Install it and run `opencode auth login` first.',
      );
    }
    return {
      command: executable,
      args: ['acp'],
    };
  },
  async environment(env, approvalMode) {
    const permission = approvalMode === 'alwaysAllow' ? 'allow' : 'ask';
    const config = parseInlineConfig(env.OPENCODE_CONFIG_CONTENT);
    const experimental = objectValue(config.experimental);
    return {
      ...env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        ...config,
        experimental: {
          ...experimental,
          mcp_timeout: Math.max(
            numberValue(experimental.mcp_timeout) ?? 0,
            12 * 60 * 60 * 1_000,
          ),
        },
        permission: {
          ...permissionObject(config.permission),
          bash: permission,
        },
      }),
    };
  },
  processKeyForApproval(approvalMode) {
    return approvalMode === 'alwaysAllow' ? 'allow' : 'ask';
  },
  continueAfterPermissionRejection: true,
  restartAfterCancel: true,
  normalizeTool: normalizeOpenCodeTool,
  normalizePlan(tool) {
    const input = objectValue(tool.rawInput);
    if (!Array.isArray(input.todos)) return;
    const entries = input.todos.flatMap((value) => {
      const todo = objectValue(value);
      const content =
        stringValue(todo.content) ?? stringValue(todo.description);
      const status = stringValue(todo.status);
      return content && status ? [{ content, status }] : [];
    });
    return entries.length === input.todos.length ? entries : undefined;
  },
};

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function parseInlineConfig(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function permissionObject(permission: unknown): Record<string, unknown> {
  if (typeof permission === 'string') return { '*': permission };
  return typeof permission === 'object' &&
    permission !== null &&
    !Array.isArray(permission)
    ? (permission as Record<string, unknown>)
    : {};
}
