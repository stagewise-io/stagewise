import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { detectShell, resolveShellEnv } from '@stagewise/agent-shell';
import { needsShell, resolveAgentExecutable } from '../../acp/adapter';

type JsonObject = Record<string, unknown>;

interface CodexModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  inputModalities?: string[];
  supportedReasoningEfforts?: Array<{ reasoningEffort?: unknown }>;
  defaultReasoningEffort?: string;
}

export class CodexAppServerClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  public constructor(
    private readonly logger: Pick<Console, 'debug' | 'warn'>,
    private readonly executable?: string,
  ) {}

  private async start(): Promise<void> {
    const shell = detectShell();
    let shellEnvironment: NodeJS.ProcessEnv | null = null;
    if (shell) {
      try {
        shellEnvironment = await resolveShellEnv(shell);
      } catch (error) {
        this.logger.debug(
          '[Codex app-server] Could not resolve login-shell environment; using process environment',
          { error },
        );
      }
    }
    const env = { ...process.env, ...(shellEnvironment ?? {}) };
    const executable =
      this.executable ?? (await resolveAgentExecutable('codex', env));
    if (!executable) {
      throw new Error(
        'Codex is not installed. Install Codex CLI and run `codex login` first.',
      );
    }
    const child = spawn(executable, ['app-server', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      shell: needsShell(executable),
    });
    this.process = child;

    createInterface({ input: child.stdout }).on('line', (line) => {
      this.handleLine(line);
    });
    createInterface({ input: child.stderr }).on('line', (line) => {
      if (line.trim()) this.logger.debug(`[Codex app-server] ${line}`);
    });
    child.once('error', (error) => this.handleExit(child, error));
    child.once('exit', (code, signal) => {
      this.handleExit(
        child,
        new Error(
          `Codex app-server exited (${signal ?? `code ${String(code)}`})`,
        ),
      );
    });

    try {
      await this.request('initialize', {
        clientInfo: {
          name: 'stagewise',
          title: 'stagewise',
          version: __APP_VERSION__,
        },
        capabilities: { experimentalApi: true },
      });
      this.write({ method: 'initialized', params: {} });
    } catch (error) {
      this.close();
      throw error;
    }
  }

  private async request<T = unknown>(
    method: string,
    params: JsonObject,
  ): Promise<T> {
    const id = this.nextRequestId++;
    const result = new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex RPC timed out: ${method}`));
      }, 30_000);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });
    });
    try {
      this.write({ id, method, params });
    } catch (error) {
      const pending = this.pending.get(id);
      if (pending) clearTimeout(pending.timeout);
      this.pending.delete(id);
      throw error;
    }
    return await result;
  }

  public async discoverModels(): Promise<CodexModel[]> {
    await this.start();
    const { account } = await this.request<{
      account: { type: string } | null;
    }>('account/read', { refreshToken: false });
    if (account?.type !== 'chatgpt') {
      throw new Error(
        'Codex is not signed in with ChatGPT. Run `codex login` first.',
      );
    }
    const response = await this.request<{ data?: CodexModel[] }>('model/list', {
      limit: 100,
      includeHidden: false,
    });
    return response.data ?? [];
  }

  public async refreshChatGptAccount(): Promise<void> {
    await this.start();
    const { account } = await this.request<{
      account: { type: string } | null;
    }>('account/read', { refreshToken: true });
    if (account?.type !== 'chatgpt') {
      throw new Error(
        'Codex is not signed in with ChatGPT. Run `codex login` first.',
      );
    }
  }

  public close(): void {
    const child = this.process;
    this.process = null;
    this.rejectPending(new Error('Codex app-server was closed'));
    if (!child) return;
    child.removeAllListeners();
    child.kill('SIGTERM');
  }

  private write(message: JsonObject): void {
    if (!this.process?.stdin.writable) {
      throw new Error(
        'Codex app-server is not running. Install Codex CLI and sign in first.',
      );
    }
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: JsonObject;
    try {
      message = JSON.parse(line) as JsonObject;
    } catch {
      this.logger.warn('[Codex app-server] Ignoring non-JSON stdout line', {
        line,
      });
      return;
    }

    const id = message.id;
    if (typeof id === 'number' && ('result' in message || 'error' in message)) {
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      clearTimeout(pending.timeout);
      if (message.error) {
        const rpcError = message.error as { message?: string };
        pending.reject(new Error(rpcError.message ?? 'Codex RPC failed'));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  private handleExit(
    child: ChildProcessWithoutNullStreams,
    error: Error,
  ): void {
    if (this.process !== child) return;
    this.process = null;
    this.rejectPending(error);
    this.logger.warn('[Codex app-server] Process stopped', { error });
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
