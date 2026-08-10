import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import nodePath from 'node:path';
import { promisify } from 'node:util';
import type { ToolCall, ToolCallUpdate } from '@agentclientprotocol/sdk';
import { detectShell, resolveShellEnv } from '@stagewise/agent-shell';
import type { ExternalAgentProviderTypeId } from '@shared/karton-contracts/ui/shared-types';

export interface AcpLaunchCommand {
  command: string;
  args: string[];
  shell?: boolean;
}

export interface PreparedAcpProcess {
  env: NodeJS.ProcessEnv;
  nodeExecutable: string;
  launch: AcpLaunchCommand;
}

export interface AcpAdapter {
  id: ExternalAgentProviderTypeId;
  displayName: string;
  minimumNodeMajor?: number;
  resolveLaunch(
    nodeExecutable: string,
    env: NodeJS.ProcessEnv,
  ): Promise<AcpLaunchCommand>;
  environment(
    resolvedEnv: NodeJS.ProcessEnv,
    approvalMode: string,
  ): Promise<NodeJS.ProcessEnv>;
  sessionModeForApproval?(approvalMode: string): string;
  processKeyForApproval?(approvalMode: string): string;
  continueAfterPermissionRejection?: boolean;
  restartAfterCancel?: boolean;
  hiddenToolNames?: readonly string[];
  hiddenToolPathPrefixes?: readonly string[];
  newSessionMeta?(approvalMode: string): Record<string, unknown> | undefined;
  normalizePlan?(
    tool: ToolCall | ToolCallUpdate,
  ): Array<{ content: string; status: string }> | undefined;
  normalizeTool?(tool: ToolCall | ToolCallUpdate): ToolCall | ToolCallUpdate;
}

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

export async function resolveBundledAdapterLaunch(
  node: string,
  bundledFile: string,
  packageEntry: string,
): Promise<AcpLaunchCommand> {
  const packaged =
    process.versions.electron && process.resourcesPath
      ? nodePath.join(process.resourcesPath, 'bundled', 'acp', bundledFile)
      : null;
  let entry: string | undefined;
  if (packaged) {
    try {
      await access(packaged, constants.R_OK);
      entry = packaged;
    } catch {}
  }
  return {
    command: node,
    args: [entry ?? require.resolve(packageEntry)],
  };
}

export async function resolveAgentExecutable(
  name: 'codex' | 'claude' | 'opencode',
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  if (name === 'codex' && env.CODEX_PATH) {
    return executablePath(env.CODEX_PATH);
  }
  if (name === 'claude' && env.CLAUDE_CODE_EXECUTABLE) {
    return executablePath(env.CLAUDE_CODE_EXECUTABLE);
  }
  if (name === 'opencode') return resolveOpenCodeExecutable(env);
  return findExecutable(name, env);
}

export async function findExecutable(
  name: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Promise<string | undefined> {
  const pathValue = env.PATH ?? env.Path ?? '';
  const names =
    platform === 'win32'
      ? [`${name}.exe`, `${name}.com`, `${name}.cmd`, `${name}.bat`, name]
      : [name];
  for (const directory of pathValue.split(nodePath.delimiter)) {
    if (!directory) continue;
    for (const candidateName of names) {
      const candidate = nodePath.join(directory, candidateName);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {}
    }
  }
  return undefined;
}

export function needsShell(
  command: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === 'win32' && /\.(?:cmd|bat)$/i.test(command);
}

export async function prepareAcpProcess(
  adapter: AcpAdapter,
  resolvedEnv: NodeJS.ProcessEnv,
  approvalMode: string,
): Promise<PreparedAcpProcess> {
  const env = await adapter.environment(resolvedEnv, approvalMode);
  const nodeExecutable = process.versions.electron
    ? await findExecutable('node', env)
    : process.execPath;
  if (!nodeExecutable) {
    throw new Error(
      `${adapter.displayName} requires Node.js in your shell PATH.`,
    );
  }
  if (adapter.minimumNodeMajor) {
    const { stdout } = await execFileAsync(nodeExecutable, ['--version'], {
      env,
    });
    const major = Number.parseInt(stdout.trim().replace(/^v/, ''), 10);
    if (!Number.isFinite(major) || major < adapter.minimumNodeMajor) {
      throw new Error(
        `${adapter.displayName} requires Node.js ${adapter.minimumNodeMajor} or newer in your shell PATH.`,
      );
    }
  }
  return {
    env,
    nodeExecutable,
    launch: await adapter.resolveLaunch(nodeExecutable, env),
  };
}

export async function resolveAcpEnvironment(): Promise<NodeJS.ProcessEnv | null> {
  const shell = detectShell();
  return shell ? resolveShellEnv(shell) : null;
}

export async function resolveOpenCodeExecutable(
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  if (env.OPENCODE_EXECUTABLE) {
    return executablePath(env.OPENCODE_EXECUTABLE);
  }
  return (
    (await findExecutable('opencode', env)) ??
    (await executablePath(
      nodePath.join(env.HOME ?? homedir(), '.opencode', 'bin', 'opencode'),
    ))
  );
}

async function executablePath(path: string): Promise<string | undefined> {
  try {
    await access(path, constants.X_OK);
    return path;
  } catch {
    return undefined;
  }
}
