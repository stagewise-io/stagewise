import { spawn as cpSpawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { getShellArgs } from './detect-shell';
import {
  DEFAULT_TIMEOUT_MS,
  HEAD_LINES,
  MAX_COLLECT_BYTES,
  TAIL_LINES,
  type DetectedShell,
  type ShellExecutionRequest,
  type ShellExecutionResult,
  type TrackedProcess,
} from './types';

export function applyHeadTailCap(lines: string[]): string {
  const total = HEAD_LINES + TAIL_LINES;
  if (lines.length <= total) return lines.join('\n');

  const head = lines.slice(0, HEAD_LINES);
  const tail = lines.slice(-TAIL_LINES);
  const truncated = lines.length - total;
  return [...head, `\n... [${truncated} lines truncated] ...\n`, ...tail].join(
    '\n',
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ProcessManager {
  private readonly shell: DetectedShell;
  private readonly processes = new Map<string, TrackedProcess>();

  private readonly loginFallback: boolean;

  constructor(shell: DetectedShell, loginFallback = false) {
    this.shell = shell;
    this.loginFallback = loginFallback;
  }

  spawn(
    agentInstanceId: string,
    request: ShellExecutionRequest,
    env: Record<string, string>,
    onOutput?: (chunk: string) => void,
    toolCallId?: string,
  ): { executionId: string; result: Promise<ShellExecutionResult> } {
    const executionId = randomUUID();
    const [cmd, args] = getShellArgs(this.shell, request.command, {
      loginFallback: this.loginFallback,
    });
    const isWin = process.platform === 'win32';

    const child = cpSpawn(cmd, args, {
      cwd: request.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !isWin,
    });

    const tracked: TrackedProcess = {
      child,
      executionId,
      agentInstanceId,
      toolCallId: toolCallId ?? executionId,
      timeoutHandle: null,
      startedAt: Date.now(),
      exited: false,
    };
    this.processes.set(executionId, tracked);

    const result = new Promise<ShellExecutionResult>((resolve) => {
      const mergedLines: string[] = [];
      const stderrLines: string[] = [];
      let collectedBytes = 0;
      let truncatedEarly = false;
      let timedOut = false;
      let aborted = false;

      tracked.markAborted = () => {
        aborted = true;
      };

      const appendLines = (data: Buffer, targets: string[][]) => {
        if (truncatedEarly) return;
        const str = data.toString('utf-8');
        collectedBytes += data.byteLength;

        if (collectedBytes > MAX_COLLECT_BYTES) {
          truncatedEarly = true;
          for (const t of targets) {
            t.push('[output truncated: exceeded 5MB collection limit]');
          }
          return;
        }

        const lines = str.split(/\r?\n/);
        for (const t of targets) t.push(...lines);
      };

      child.stdout?.on('data', (data: Buffer) => {
        onOutput?.(data.toString('utf-8'));
        appendLines(data, [mergedLines]);
      });

      child.stderr?.on('data', (data: Buffer) => {
        onOutput?.(data.toString('utf-8'));
        appendLines(data, [mergedLines, stderrLines]);
      });

      const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      tracked.timeoutHandle = setTimeout(() => {
        timedOut = true;
        void this.kill(executionId);
      }, timeoutMs);

      const onAbort = () => {
        aborted = true;
        void this.kill(executionId);
      };
      request.abortSignal?.addEventListener('abort', onAbort, {
        once: true,
      });

      const cleanup = (exitCode: number | null) => {
        if (tracked.exited) return;
        tracked.exited = true;

        if (tracked.timeoutHandle) {
          clearTimeout(tracked.timeoutHandle);
          tracked.timeoutHandle = null;
        }
        request.abortSignal?.removeEventListener('abort', onAbort);
        this.processes.delete(executionId);

        resolve({
          output: applyHeadTailCap(mergedLines),
          stderr: applyHeadTailCap(stderrLines),
          exitCode,
          timedOut,
          aborted,
        });
      };

      child.on('close', (code) => cleanup(code));
      child.on('error', () => cleanup(null));
    });

    return { executionId, result };
  }

  async kill(executionId: string): Promise<boolean> {
    const tracked = this.processes.get(executionId);
    if (!tracked) return false;

    const { child } = tracked;
    const pid = child.pid;
    if (pid === undefined) return false;

    if (process.platform === 'win32') return this.killWindows(tracked, pid);

    return this.killUnix(tracked, pid);
  }

  private async killUnix(
    tracked: TrackedProcess,
    pid: number,
  ): Promise<boolean> {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        tracked.child.kill('SIGTERM');
      } catch {
        return false;
      }
    }

    await sleep(200);
    if (tracked.exited) return true;

    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        tracked.child.kill('SIGKILL');
      } catch {}
    }

    return true;
  }

  private async killWindows(
    tracked: TrackedProcess,
    pid: number,
  ): Promise<boolean> {
    const killed = await new Promise<boolean>((resolve) => {
      const taskkill = cpSpawn('taskkill', ['/F', '/T', '/PID', String(pid)], {
        stdio: 'ignore',
      });
      taskkill.on('exit', () => resolve(true));
      taskkill.on('error', () => resolve(false));
    });

    // taskkill /F bypasses the normal process exit flow, so Node.js
    // may never receive the 'close' event on the child. Force it
    // after a short grace period so the result promise resolves.
    if (killed && !tracked.exited) {
      await sleep(500);
      if (!tracked.exited) tracked.child.emit('close', 1);
    }

    return killed;
  }

  getToolCallIdsForAgent(agentInstanceId: string): string[] {
    const ids: string[] = [];
    for (const [, tracked] of this.processes)
      if (tracked.agentInstanceId === agentInstanceId)
        ids.push(tracked.toolCallId);

    return ids;
  }

  killByAgent(agentInstanceId: string): void {
    for (const [, tracked] of this.processes)
      if (tracked.agentInstanceId === agentInstanceId)
        void this.kill(tracked.executionId);
  }

  async killByToolCallId(toolCallId: string): Promise<boolean> {
    for (const [, tracked] of this.processes) {
      if (tracked.toolCallId === toolCallId) {
        tracked.markAborted?.();
        return this.kill(tracked.executionId);
      }
    }
    return false;
  }

  killAll(): void {
    for (const [, tracked] of this.processes)
      void this.kill(tracked.executionId);

    this.processes.clear();
  }
}
