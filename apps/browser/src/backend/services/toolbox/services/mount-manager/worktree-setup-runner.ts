import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { KartonService } from '@/services/karton';
import type { Logger } from '@/services/logger';
import type { TelemetryService } from '@/services/telemetry';

const WORKTREE_SETUP_SCRIPT_RELATIVE_PATH = path.join(
  '.stagewise',
  'worktree-setup.sh',
);
const WORKTREE_SETUP_TIMEOUT_MS = 20 * 60 * 1000;
const OUTPUT_TAIL_MAX_LENGTH = 12_000;
const OUTPUT_UPDATE_INTERVAL_MS = 150;

const WORKTREE_SETUP_TIMEOUT_MESSAGE = 'Worktree setup timed out.';
const WORKTREE_SETUP_WINDOWS_UNSUPPORTED_MESSAGE =
  'Worktree setup scripts are not supported on Windows yet.';

const EXPECTED_FAILURE_MESSAGES = new Set([
  WORKTREE_SETUP_TIMEOUT_MESSAGE,
  WORKTREE_SETUP_WINDOWS_UNSUPPORTED_MESSAGE,
  'Worktree setup was interrupted.',
]);

type SpawnProcess = {
  stdout: Readable;
  stderr: Readable;
  kill: () => boolean | undefined;
  on(event: 'error', listener: (error: Error) => void): SpawnProcess;
  on(event: 'close', listener: (code: number | null) => void): SpawnProcess;
};

type SpawnFn = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdio: ['ignore', 'pipe', 'pipe'];
  },
) => SpawnProcess;

export type WorktreeSetupMetadata = {
  workspacePath: string;
  sourceWorktreePath: string;
  mainWorktreePath: string;
};

type WorktreeSetupRunnerDeps = {
  logger: Logger;
  telemetryService: TelemetryService;
  uiKarton: KartonService;
  resolvedEnvPromise: Promise<Record<string, string> | null>;
  spawnProcess?: SpawnFn;
  timeoutMs?: number;
  platform?: NodeJS.Platform;
};

type ActiveRun = {
  child: SpawnProcess | null;
  timeout: ReturnType<typeof setTimeout>;
  outputFlushTimer: ReturnType<typeof setTimeout> | null;
  stdoutTail: string;
  stderrTail: string;
  settled: boolean;
};

function appendTail(current: string, chunk: Buffer): string {
  const next = current + chunk.toString('utf8');
  if (next.length <= OUTPUT_TAIL_MAX_LENGTH) return next;
  return next.slice(next.length - OUTPUT_TAIL_MAX_LENGTH);
}

export class WorktreeSetupRunner {
  private readonly logger: Logger;
  private readonly telemetryService: TelemetryService;
  private readonly uiKarton: KartonService;
  private readonly resolvedEnvPromise: Promise<Record<string, string> | null>;
  private readonly spawnProcess: SpawnFn;
  private readonly timeoutMs: number;
  private readonly platform: NodeJS.Platform;
  private readonly activeRuns = new Map<string, ActiveRun>();

  public constructor({
    logger,
    telemetryService,
    uiKarton,
    resolvedEnvPromise,
    spawnProcess = (command, args, options) =>
      spawn(command, args, options) as SpawnProcess,
    timeoutMs = WORKTREE_SETUP_TIMEOUT_MS,
    platform = process.platform,
  }: WorktreeSetupRunnerDeps) {
    this.logger = logger;
    this.telemetryService = telemetryService;
    this.uiKarton = uiKarton;
    this.resolvedEnvPromise = resolvedEnvPromise;
    this.spawnProcess = spawnProcess;
    this.timeoutMs = timeoutMs;
    this.platform = platform;
  }

  public async start(metadata: WorktreeSetupMetadata): Promise<void> {
    if (this.activeRuns.has(metadata.workspacePath)) return;

    const workspaceScriptPath = path.join(
      metadata.workspacePath,
      WORKTREE_SETUP_SCRIPT_RELATIVE_PATH,
    );
    const mainWorktreeScriptPath = path.join(
      metadata.mainWorktreePath,
      WORKTREE_SETUP_SCRIPT_RELATIVE_PATH,
    );
    const scriptPath = (await this.pathExists(workspaceScriptPath))
      ? workspaceScriptPath
      : (await this.pathExists(mainWorktreeScriptPath))
        ? mainWorktreeScriptPath
        : null;
    if (!scriptPath) return;

    const runId = randomUUID();
    const startedAt = Date.now();
    this.uiKarton.setState((draft) => {
      draft.workspaceGitSetup.runsByPath[metadata.workspacePath] = {
        id: runId,
        workspacePath: metadata.workspacePath,
        sourceWorktreePath: metadata.sourceWorktreePath,
        mainWorktreePath: metadata.mainWorktreePath,
        scriptPath,
        status: 'running',
        startedAt,
        finishedAt: null,
        exitCode: null,
        message: null,
        stdoutTail: '',
        stderrTail: '',
      };
    });

    const activeRun: ActiveRun = {
      child: null,
      timeout: setTimeout(() => {
        if (activeRun.settled) return;
        try {
          activeRun.child?.kill();
        } catch {
          // ignore kill failures; the run is already marked failed below.
        }
        finish('failed', null, WORKTREE_SETUP_TIMEOUT_MESSAGE);
      }, this.timeoutMs),
      outputFlushTimer: null,
      stdoutTail: '',
      stderrTail: '',
      settled: false,
    };
    this.activeRuns.set(metadata.workspacePath, activeRun);

    const flushOutput = () => {
      if (activeRun.outputFlushTimer) {
        clearTimeout(activeRun.outputFlushTimer);
        activeRun.outputFlushTimer = null;
      }
      this.updateOutput(
        metadata.workspacePath,
        activeRun.stdoutTail,
        activeRun.stderrTail,
      );
    };

    const scheduleOutputFlush = () => {
      if (activeRun.outputFlushTimer) return;
      activeRun.outputFlushTimer = setTimeout(() => {
        activeRun.outputFlushTimer = null;
        this.updateOutput(
          metadata.workspacePath,
          activeRun.stdoutTail,
          activeRun.stderrTail,
        );
      }, OUTPUT_UPDATE_INTERVAL_MS);
    };

    const finish = (
      status: 'succeeded' | 'failed',
      exitCode: number | null,
      message: string | null,
      error?: Error,
    ) => {
      if (activeRun.settled) return;
      activeRun.settled = true;
      clearTimeout(activeRun.timeout);
      flushOutput();
      this.activeRuns.delete(metadata.workspacePath);
      this.finishRun(metadata.workspacePath, {
        status,
        exitCode,
        message,
        stdoutTail: activeRun.stdoutTail,
        stderrTail: activeRun.stderrTail,
        error,
      });
    };

    if (this.platform === 'win32') {
      finish('failed', null, WORKTREE_SETUP_WINDOWS_UNSUPPORTED_MESSAGE);
      return;
    }

    let resolvedEnv: Record<string, string> | null;
    try {
      resolvedEnv = await this.resolvedEnvPromise;
    } catch (error) {
      finish(
        'failed',
        null,
        error instanceof Error
          ? `Failed to resolve worktree setup environment: ${error.message}`
          : 'Failed to resolve worktree setup environment.',
        error instanceof Error ? error : undefined,
      );
      return;
    }
    if (activeRun.settled) return;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...(resolvedEnv ?? {}),
      STAGEWISE_SOURCE_WORKTREE_PATH: metadata.sourceWorktreePath,
      STAGEWISE_TARGET_WORKTREE_PATH: metadata.workspacePath,
      STAGEWISE_MAIN_WORKTREE_PATH: metadata.mainWorktreePath,
    };

    try {
      activeRun.child = this.spawnProcess('/bin/sh', [scriptPath], {
        cwd: metadata.workspacePath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      finish(
        'failed',
        null,
        error instanceof Error
          ? `Failed to start worktree setup: ${error.message}`
          : 'Failed to start worktree setup.',
        error instanceof Error ? error : undefined,
      );
      return;
    }

    activeRun.child.stdout.on('data', (chunk: Buffer) => {
      activeRun.stdoutTail = appendTail(activeRun.stdoutTail, chunk);
      scheduleOutputFlush();
    });
    activeRun.child.stderr.on('data', (chunk: Buffer) => {
      activeRun.stderrTail = appendTail(activeRun.stderrTail, chunk);
      scheduleOutputFlush();
    });

    activeRun.child.on('error', (error: Error) => {
      finish('failed', null, `Worktree setup failed: ${error.message}`, error);
    });
    activeRun.child.on('close', (code: number | null) => {
      if (code === 0) {
        finish('succeeded', 0, null);
        return;
      }
      finish(
        'failed',
        code,
        `Worktree setup exited with code ${code ?? 'null'}.`,
      );
    });
  }

  public teardown(): void {
    for (const [workspacePath, run] of this.activeRuns) {
      run.settled = true;
      clearTimeout(run.timeout);
      if (run.outputFlushTimer) {
        clearTimeout(run.outputFlushTimer);
        run.outputFlushTimer = null;
      }
      try {
        run.child?.kill();
      } catch {
        // ignore
      }
      this.finishRun(workspacePath, {
        status: 'failed',
        exitCode: null,
        message: 'Worktree setup was interrupted.',
        stdoutTail: run.stdoutTail,
        stderrTail: run.stderrTail,
      });
    }
    this.activeRuns.clear();
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(targetPath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  private updateOutput(
    workspacePath: string,
    stdoutTail: string,
    stderrTail: string,
  ): void {
    this.uiKarton.setState((draft) => {
      const run = draft.workspaceGitSetup.runsByPath[workspacePath];
      if (!run || run.status !== 'running') return;
      run.stdoutTail = stdoutTail;
      run.stderrTail = stderrTail;
    });
  }

  private finishRun(
    workspacePath: string,
    result: {
      status: 'succeeded' | 'failed';
      exitCode: number | null;
      message: string | null;
      stdoutTail: string;
      stderrTail: string;
      error?: Error;
    },
  ): void {
    this.uiKarton.setState((draft) => {
      const run = draft.workspaceGitSetup.runsByPath[workspacePath];
      if (!run) return;
      run.status = result.status;
      run.finishedAt = Date.now();
      run.exitCode = result.exitCode;
      run.message = result.message;
      run.stdoutTail = result.stdoutTail;
      run.stderrTail = result.stderrTail;
    });

    if (result.status === 'failed') {
      this.logger.warn('[WorktreeSetupRunner] Worktree setup failed', {
        workspacePath,
        message: result.message,
        exitCode: result.exitCode,
      });

      if (
        result.error &&
        !EXPECTED_FAILURE_MESSAGES.has(result.message ?? '')
      ) {
        this.telemetryService.captureException(result.error, {
          service: 'worktree-setup-runner',
          operation: 'runSetup',
        });
      }
    }
  }
}
