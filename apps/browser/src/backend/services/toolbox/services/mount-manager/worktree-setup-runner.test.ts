import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KartonService } from '@/services/karton';
import type { Logger } from '@/services/logger';
import type { TelemetryService } from '@/services/telemetry';
import { mergeEnv, WorktreeSetupRunner } from './worktree-setup-runner';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worktree-setup-runner-'));
});

afterEach(async () => {
  vi.useRealTimers();
  await fs.rm(tempDir, { recursive: true, force: true });
});

function createKarton() {
  const state = { workspaceGitSetup: { runsByPath: {} } } as {
    workspaceGitSetup: {
      runsByPath: Record<
        string,
        {
          status: string;
          scriptPath: string;
          stdoutTail: string;
          stderrTail: string;
          finishedAt: number | null;
          exitCode: number | null;
          message: string | null;
        }
      >;
    };
  };

  return {
    state,
    uiKarton: {
      state,
      setState: vi.fn((recipe: (draft: typeof state) => void) => recipe(state)),
    } as unknown as KartonService,
  };
}

function metadata(mainWorktreePath: string, workspacePath: string) {
  return {
    workspacePath,
    sourceWorktreePath: mainWorktreePath,
    mainWorktreePath,
  };
}

async function writeSetupScript(worktreePath: string, content = 'exit 0') {
  const scriptPath = path.join(worktreePath, '.stagewise', 'worktree-setup.sh');
  await fs.mkdir(path.dirname(scriptPath), { recursive: true });
  await fs.writeFile(scriptPath, content);
  return scriptPath;
}

async function writePowerShellScript(worktreePath: string, content = 'exit 0') {
  const scriptPath = path.join(
    worktreePath,
    '.stagewise',
    'worktree-setup.ps1',
  );
  await fs.mkdir(path.dirname(scriptPath), { recursive: true });
  await fs.writeFile(scriptPath, content);
  return scriptPath;
}

function createProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  return child;
}

type TestSpawnProcess = ReturnType<typeof createProcess>;

type TestRunnerDeps = {
  logger: Logger;
  telemetryService: TelemetryService;
  uiKarton: KartonService;
  resolvedEnvPromise: Promise<Record<string, string> | null>;
  spawnProcess?: (
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      stdio: ['ignore', 'pipe', 'pipe'];
    },
  ) => TestSpawnProcess;
  resolvePowerShellCommand?: (env: NodeJS.ProcessEnv) => string;
  timeoutMs?: number;
  platform?: NodeJS.Platform;
};

function createRunner(deps: TestRunnerDeps) {
  return new WorktreeSetupRunner({
    platform: 'darwin',
    ...deps,
  });
}

describe('mergeEnv', () => {
  it('lets overrides replace base entries that differ only in case', () => {
    // Simulates Windows: process.env exposes a stale `Path`, the resolved
    // shell environment exposes the real `PATH` (with pwsh on it).
    const merged = mergeEnv(
      { Path: 'C:\\stale', OTHER: 'keep' },
      { PATH: 'C:\\resolved\\pwsh' },
    );

    expect(merged.Path).toBeUndefined();
    expect(merged.PATH).toBe('C:\\resolved\\pwsh');
    expect(merged.OTHER).toBe('keep');
    // Only one PATH-like key survives, so the child receives no duplicates.
    const pathKeys = Object.keys(merged).filter(
      (key) => key.toLowerCase() === 'path',
    );
    expect(pathKeys).toEqual(['PATH']);
  });
});

describe('WorktreeSetupRunner', () => {
  it('does not create setup state when the script is missing', async () => {
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    const { state, uiKarton } = createKarton();
    const spawnProcess = vi.fn();
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException: vi.fn(),
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise: Promise.resolve(null),
      spawnProcess,
    });

    await runner.start(metadata(mainWorktreePath, workspacePath));

    expect(spawnProcess).not.toHaveBeenCalled();
    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toBeUndefined();
  });

  it('falls back to setup scripts that exist only in the main worktree', async () => {
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    const scriptPath = await writeSetupScript(mainWorktreePath);
    const child = createProcess();
    const { state, uiKarton } = createKarton();
    const spawnProcess = vi.fn(() => child);
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException: vi.fn(),
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise: Promise.resolve(null),
      spawnProcess,
    });

    await runner.start(metadata(mainWorktreePath, workspacePath));

    expect(spawnProcess).toHaveBeenCalledWith('/bin/sh', [scriptPath], {
      cwd: workspacePath,
      env: expect.not.objectContaining({
        STAGEWISE_SETUP_SCRIPT: expect.any(String),
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toMatchObject({
      scriptPath,
      status: 'running',
    });

    child.emit('close', 0);
    runner.teardown();
  });

  it('spawns the setup script with expected cwd and environment', async () => {
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    const scriptPath = await writeSetupScript(workspacePath);
    const child = createProcess();
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    const spawnProcess = vi.fn(
      (
        _command: string,
        _args: string[],
        options: {
          cwd: string;
          env: NodeJS.ProcessEnv;
          stdio: ['ignore', 'pipe', 'pipe'];
        },
      ) => {
        capturedEnv = options.env;
        return child;
      },
    );
    const { state, uiKarton } = createKarton();
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException: vi.fn(),
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise: Promise.resolve({ PATH: '/custom/bin' }),
      spawnProcess,
    });

    await runner.start(metadata(mainWorktreePath, workspacePath));

    expect(spawnProcess).toHaveBeenCalledWith('/bin/sh', [scriptPath], {
      cwd: workspacePath,
      env: expect.objectContaining({
        PATH: '/custom/bin',
        STAGEWISE_SOURCE_WORKTREE_PATH: mainWorktreePath,
        STAGEWISE_TARGET_WORKTREE_PATH: workspacePath,
        STAGEWISE_MAIN_WORKTREE_PATH: mainWorktreePath,
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(capturedEnv).toEqual(
      expect.not.objectContaining({
        STAGEWISE_MAIN_WORKTREE: expect.any(String),
        STAGEWISE_NEW_WORKTREE: expect.any(String),
        STAGEWISE_WORKTREE: expect.any(String),
        STAGEWISE_SOURCE_BRANCH: expect.any(String),
        STAGEWISE_WORKTREE_BRANCH: expect.any(String),
        STAGEWISE_REPOSITORY_ID: expect.any(String),
        STAGEWISE_SETUP_SCRIPT: expect.any(String),
      }),
    );
    expect(state.workspaceGitSetup.runsByPath[workspacePath]?.status).toBe(
      'running',
    );

    child.emit('close', 0);
    runner.teardown();
  });

  it('updates state to succeeded on zero exit', async () => {
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    await writeSetupScript(workspacePath);
    const child = createProcess();
    const { state, uiKarton } = createKarton();
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException: vi.fn(),
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise: Promise.resolve(null),
      spawnProcess: vi.fn(() => child),
    });

    await runner.start(metadata(mainWorktreePath, workspacePath));
    child.stdout.write('installed');
    child.emit('close', 0);

    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toMatchObject({
      status: 'succeeded',
      exitCode: 0,
      message: null,
      stdoutTail: 'installed',
    });
  });

  it('updates state to failed on non-zero exit', async () => {
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    await writeSetupScript(workspacePath);
    const child = createProcess();
    const { state, uiKarton } = createKarton();
    const captureException = vi.fn();
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException,
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise: Promise.resolve(null),
      spawnProcess: vi.fn(() => child),
    });

    await runner.start(metadata(mainWorktreePath, workspacePath));
    child.stderr.write('failed badly');
    child.emit('close', 1);

    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toMatchObject({
      status: 'failed',
      exitCode: 1,
      message: 'Worktree setup exited with code 1.',
      stderrTail: 'failed badly',
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('spawns the PowerShell variant on Windows', async () => {
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    const scriptPath = await writePowerShellScript(workspacePath);
    const child = createProcess();
    const { state, uiKarton } = createKarton();
    const spawnProcess = vi.fn(() => child);
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException: vi.fn(),
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise: Promise.resolve(null),
      spawnProcess,
      resolvePowerShellCommand: () => 'powershell.exe',
      platform: 'win32',
    });

    await runner.start(metadata(mainWorktreePath, workspacePath));

    expect(spawnProcess).toHaveBeenCalledWith(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
      ],
      {
        cwd: workspacePath,
        env: expect.objectContaining({
          STAGEWISE_TARGET_WORKTREE_PATH: workspacePath,
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toMatchObject({
      scriptPath,
      status: 'running',
    });

    child.emit('close', 0);
    runner.teardown();
  });

  it('uses pwsh when the resolver returns it', async () => {
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    const scriptPath = await writePowerShellScript(workspacePath);
    const child = createProcess();
    const { uiKarton } = createKarton();
    const spawnProcess = vi.fn(() => child);
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException: vi.fn(),
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise: Promise.resolve(null),
      spawnProcess,
      resolvePowerShellCommand: () => 'pwsh',
      platform: 'win32',
    });

    await runner.start(metadata(mainWorktreePath, workspacePath));

    expect(spawnProcess).toHaveBeenCalledWith(
      'pwsh',
      expect.arrayContaining(['-File', scriptPath]),
      expect.objectContaining({ cwd: workspacePath }),
    );

    child.emit('close', 0);
    runner.teardown();
  });

  it('resolves PowerShell using the resolved spawn environment PATH', async () => {
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    await writePowerShellScript(workspacePath);
    const child = createProcess();
    const { uiKarton } = createKarton();
    const spawnProcess = vi.fn(() => child);
    const resolvedPath = path.join(tempDir, 'resolved-tools');
    let resolverEnv: NodeJS.ProcessEnv | null = null;
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException: vi.fn(),
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise: Promise.resolve({ PATH: resolvedPath }),
      spawnProcess,
      resolvePowerShellCommand: (env) => {
        resolverEnv = env;
        return 'pwsh';
      },
      platform: 'win32',
    });

    await runner.start(metadata(mainWorktreePath, workspacePath));

    // The resolver must see the PATH the child process actually receives, not
    // the (possibly stripped) process.env PATH.
    expect(resolverEnv).not.toBeNull();
    expect((resolverEnv as unknown as NodeJS.ProcessEnv).PATH).toBe(
      resolvedPath,
    );
    expect(spawnProcess).toHaveBeenCalledWith(
      'pwsh',
      expect.anything(),
      expect.objectContaining({
        env: expect.objectContaining({ PATH: resolvedPath }),
      }),
    );

    child.emit('close', 0);
    runner.teardown();
  });

  it('falls back to the PowerShell script in the main worktree on Windows', async () => {
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    const scriptPath = await writePowerShellScript(mainWorktreePath);
    const child = createProcess();
    const { state, uiKarton } = createKarton();
    const spawnProcess = vi.fn(() => child);
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException: vi.fn(),
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise: Promise.resolve(null),
      spawnProcess,
      resolvePowerShellCommand: () => 'powershell.exe',
      platform: 'win32',
    });

    await runner.start(metadata(mainWorktreePath, workspacePath));

    expect(spawnProcess).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-File', scriptPath]),
      expect.objectContaining({ cwd: workspacePath }),
    );
    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toMatchObject({
      scriptPath,
      status: 'running',
    });

    child.emit('close', 0);
    runner.teardown();
  });

  it('does not run a POSIX-only script on Windows', async () => {
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    // Only a .sh script exists; on Windows the runner looks for .ps1.
    await writeSetupScript(workspacePath);
    const { state, uiKarton } = createKarton();
    const spawnProcess = vi.fn();
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException: vi.fn(),
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise: Promise.resolve(null),
      spawnProcess,
      platform: 'win32',
    });

    await runner.start(metadata(mainWorktreePath, workspacePath));

    expect(spawnProcess).not.toHaveBeenCalled();
    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toBeUndefined();
  });

  it('marks setup failed if environment resolution times out', async () => {
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    await writeSetupScript(workspacePath);
    const { state, uiKarton } = createKarton();
    const spawnProcess = vi.fn();
    const captureException = vi.fn();
    let resolveEnv!: (env: Record<string, string> | null) => void;
    const resolvedEnvPromise = new Promise<Record<string, string> | null>(
      (resolve) => {
        resolveEnv = resolve;
      },
    );
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException,
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise,
      spawnProcess,
      timeoutMs: 10,
    });

    const startPromise = runner.start(
      metadata(mainWorktreePath, workspacePath),
    );

    await vi.waitFor(() => {
      expect(state.workspaceGitSetup.runsByPath[workspacePath]?.status).toBe(
        'failed',
      );
    });
    expect(spawnProcess).not.toHaveBeenCalled();
    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toMatchObject({
      exitCode: null,
      message: 'Worktree setup timed out.',
    });
    expect(captureException).not.toHaveBeenCalled();

    resolveEnv(null);
    await startPromise;
  });

  it('flushes pending output when the process exits', async () => {
    vi.useFakeTimers();
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    await writeSetupScript(workspacePath);
    const child = createProcess();
    const { state, uiKarton } = createKarton();
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException: vi.fn(),
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise: Promise.resolve(null),
      spawnProcess: vi.fn(() => child),
    });

    await runner.start(metadata(mainWorktreePath, workspacePath));
    child.stdout.write('first');
    child.stdout.write('second');
    expect(state.workspaceGitSetup.runsByPath[workspacePath]?.stdoutTail).toBe(
      '',
    );

    child.emit('close', 0);

    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toMatchObject({
      status: 'succeeded',
      stdoutTail: 'firstsecond',
    });
  });

  it('preserves captured output when interrupted during teardown', async () => {
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    await writeSetupScript(workspacePath);
    const child = createProcess();
    const { state, uiKarton } = createKarton();
    const captureException = vi.fn();
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException,
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise: Promise.resolve(null),
      spawnProcess: vi.fn(() => child),
    });

    await runner.start(metadata(mainWorktreePath, workspacePath));
    child.stdout.write('partial output');
    child.stderr.write('partial error');
    runner.teardown();

    expect(child.kill).toHaveBeenCalledOnce();
    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toMatchObject({
      status: 'failed',
      message: 'Worktree setup was interrupted.',
      stdoutTail: 'partial output',
      stderrTail: 'partial error',
    });

    child.emit('close', 1);

    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toMatchObject({
      status: 'failed',
      message: 'Worktree setup was interrupted.',
      stdoutTail: 'partial output',
      stderrTail: 'partial error',
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('marks setup failed and kills the process on timeout', async () => {
    vi.useFakeTimers();
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    await writeSetupScript(workspacePath);
    const child = createProcess();
    const { state, uiKarton } = createKarton();
    const captureException = vi.fn();
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException,
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise: Promise.resolve(null),
      spawnProcess: vi.fn(() => child),
      timeoutMs: 100,
    });

    await runner.start(metadata(mainWorktreePath, workspacePath));
    vi.advanceTimersByTime(100);

    expect(child.kill).toHaveBeenCalledOnce();
    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toMatchObject({
      status: 'failed',
      exitCode: null,
      message: 'Worktree setup timed out.',
    });

    child.emit('close', 1);

    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toMatchObject({
      status: 'failed',
      exitCode: null,
      message: 'Worktree setup timed out.',
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not spawn after teardown if environment resolves late', async () => {
    const mainWorktreePath = path.join(tempDir, 'main');
    const workspacePath = path.join(tempDir, 'worktree');
    await fs.mkdir(workspacePath, { recursive: true });
    await writeSetupScript(workspacePath);
    let resolveEnv!: (env: Record<string, string> | null) => void;
    const resolvedEnvPromise = new Promise<Record<string, string> | null>(
      (resolve) => {
        resolveEnv = resolve;
      },
    );
    const { state, uiKarton } = createKarton();
    const spawnProcess = vi.fn();
    const captureException = vi.fn();
    const runner = createRunner({
      logger: { warn: vi.fn() } as unknown as Logger,
      telemetryService: {
        captureException,
      } as unknown as TelemetryService,
      uiKarton,
      resolvedEnvPromise,
      spawnProcess,
    });

    const startPromise = runner.start(
      metadata(mainWorktreePath, workspacePath),
    );
    await vi.waitFor(() => {
      expect(state.workspaceGitSetup.runsByPath[workspacePath]?.status).toBe(
        'running',
      );
    });

    runner.teardown();
    resolveEnv(null);
    await startPromise;

    expect(spawnProcess).not.toHaveBeenCalled();
    expect(state.workspaceGitSetup.runsByPath[workspacePath]).toMatchObject({
      status: 'failed',
      exitCode: null,
      message: 'Worktree setup was interrupted.',
    });
    expect(captureException).not.toHaveBeenCalled();
  });
});
