import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- chokidar mock -----------------------------------------------------------
// A controllable fake watcher so we can deterministically drive `addDir` /
// `unlinkDir` events without touching the real filesystem (real chokidar
// events are inherently flaky in unit tests — see the diff-history suite which
// skips them for the same reason).
const { watchInstances, resetWatchInstances } = vi.hoisted(() => {
  const instances: unknown[] = [];
  return {
    watchInstances: instances,
    resetWatchInstances: () => {
      instances.length = 0;
    },
  };
});

vi.mock('chokidar', () => ({
  default: {
    watch: (p: string, o: Record<string, unknown>) => {
      // Constructed lazily so the hoisted class is in scope.
      const watcher = {
        watchPath: p,
        options: o,
        handlers: new Map<string, ((...a: unknown[]) => void)[]>(),
        closed: false,
        closeCount: 0,
        on(event: string, cb: (...a: unknown[]) => void) {
          const list = this.handlers.get(event) ?? [];
          list.push(cb);
          this.handlers.set(event, list);
          return this;
        },
        trigger(event: string, ...args: unknown[]) {
          // Mirror chokidar: a concrete fs event fires both its named
          // listeners and the `all` listener (with the event name prepended).
          for (const cb of this.handlers.get(event) ?? []) cb(...args);
          if (event !== 'all' && event !== 'error') {
            for (const cb of this.handlers.get('all') ?? []) cb(event, ...args);
          }
        },
        close() {
          this.closed = true;
          this.closeCount += 1;
          return Promise.resolve();
        },
      };
      watchInstances.push(watcher as never);
      return watcher;
    },
  },
}));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'home'
        ? path.join(os.tmpdir(), 'mm-watcher-home')
        : path.join(os.tmpdir(), `mock-${name}`),
  },
}));

import { MountManagerService, shouldIgnoreForGitWorktreeWatch } from '.';
import type { FilePickerService } from '@/services/file-picker';
import type { GitService } from '@/services/git';
import type { KartonService } from '@/services/karton';
import type { Logger } from '@/services/logger';
import type { TelemetryService } from '@/services/telemetry';
import type { UserExperienceService } from '@/services/experience';

type FakeWatcherInstance = {
  watchPath: string;
  options: Record<string, unknown>;
  closed: boolean;
  closeCount: number;
  trigger: (event: string, ...args: unknown[]) => void;
};

const services: MountManagerService[] = [];

function createHarness() {
  const state = {
    toolbox: {},
    gitWorktreeRevisions: {} as Record<string, number>,
    agents: { instances: {} },
    workspaceGitSetup: { runsByPath: {} },
  };

  const uiKarton = {
    state,
    setState: vi.fn((recipe: (draft: typeof state) => void) => recipe(state)),
    registerServerProcedureHandler: vi.fn(),
    removeServerProcedureHandler: vi.fn(),
  } as unknown as KartonService;

  const gitService = {} as unknown as GitService;
  const userExperienceService = {
    saveRecentlyOpenedWorkspace: vi.fn(),
    getRecentlyOpenedWorkspaces: vi.fn(async () => []),
  } as unknown as UserExperienceService;
  const preferencesService = {
    get: vi.fn(() => ({
      agent: { workspaceGitCleanup: { dismissedCandidates: {} } },
    })),
  };

  const service = new MountManagerService(
    {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      isDebugEnabled: false,
    } as unknown as Logger,
    {} as FilePickerService,
    userExperienceService,
    uiKarton,
    {
      capture: vi.fn(),
      captureException: vi.fn(),
    } as unknown as TelemetryService,
    gitService,
    preferencesService as never,
  );

  services.push(service);
  return { service, state };
}

function ensureWatcher(
  service: MountManagerService,
  wsPath: string,
  commonGitDir: string,
): void {
  const fn = Reflect.get(service, 'ensureGitWorktreeWatcher') as (
    p: string,
    g: string,
  ) => void;
  fn.call(service, wsPath, commonGitDir);
}

function releaseWatcher(service: MountManagerService, wsPath: string): void {
  const fn = Reflect.get(service, 'releaseGitWorktreeWatcher') as (
    p: string,
  ) => void;
  fn.call(service, wsPath);
}

function watchersForRepo(
  service: MountManagerService,
): Map<string, { refs: Set<string> }> {
  return Reflect.get(service, 'gitWorktreeWatchersPerRepo') as Map<
    string,
    { refs: Set<string> }
  >;
}

beforeEach(() => {
  resetWatchInstances();
  vi.useFakeTimers();
});

afterEach(async () => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  await Promise.all(services.splice(0).map((s) => s.teardown()));
});

describe('shouldIgnoreForGitWorktreeWatch', () => {
  const gitDir = '/repo/.git';

  it('never ignores the common git dir root (so worktrees/ creation is seen)', () => {
    expect(shouldIgnoreForGitWorktreeWatch(gitDir, gitDir)).toBe(false);
  });

  it('watches the worktrees directory and its direct children', () => {
    expect(shouldIgnoreForGitWorktreeWatch(gitDir, `${gitDir}/worktrees`)).toBe(
      false,
    );
    expect(
      shouldIgnoreForGitWorktreeWatch(gitDir, `${gitDir}/worktrees/feature-x`),
    ).toBe(false);
  });

  it('ignores the heavy/noisy parts of the git dir', () => {
    for (const noisy of [
      'objects',
      'objects/pack/pack-abc.pack',
      'refs',
      'refs/heads/main',
      'logs',
      'logs/HEAD',
      'index',
      'config',
      'packed-refs',
      'ORIG_HEAD',
      'COMMIT_EDITMSG',
      'HEAD.lock',
    ]) {
      expect(
        shouldIgnoreForGitWorktreeWatch(gitDir, `${gitDir}/${noisy}`),
        `expected ${noisy} to be ignored`,
      ).toBe(true);
    }
  });

  it('watches HEAD files (root + per-worktree) for branch-switch detection', () => {
    // Main worktree's checked-out ref.
    expect(shouldIgnoreForGitWorktreeWatch(gitDir, `${gitDir}/HEAD`)).toBe(
      false,
    );
    // Linked worktree's checked-out ref.
    expect(
      shouldIgnoreForGitWorktreeWatch(
        gitDir,
        `${gitDir}/worktrees/feature-x/HEAD`,
      ),
    ).toBe(false);
  });

  it('ignores per-worktree churn but keeps that worktree\u2019s HEAD', () => {
    for (const ignored of [
      'worktrees/feature-x/index',
      'worktrees/feature-x/commondir',
      'worktrees/feature-x/gitdir',
      'worktrees/feature-x/ORIG_HEAD',
      'worktrees/feature-x/logs/HEAD',
    ]) {
      expect(
        shouldIgnoreForGitWorktreeWatch(gitDir, `${gitDir}/${ignored}`),
        `expected ${ignored} to be ignored`,
      ).toBe(true);
    }
    expect(
      shouldIgnoreForGitWorktreeWatch(
        gitDir,
        `${gitDir}/worktrees/feature-x/HEAD`,
      ),
    ).toBe(false);
  });

  it('ignores paths resolving outside the git dir', () => {
    expect(shouldIgnoreForGitWorktreeWatch(gitDir, '/repo/other')).toBe(true);
    expect(shouldIgnoreForGitWorktreeWatch(gitDir, '/elsewhere')).toBe(true);
  });

  it('works cross-platform with windows-style separators', () => {
    const winGitDir = 'C:\\repo\\.git';
    const winPath = {
      sep: '\\',
      relative: (from: string, to: string) =>
        to.startsWith(`${from}\\`) ? to.slice(from.length + 1) : '..',
    };
    expect(
      shouldIgnoreForGitWorktreeWatch(
        winGitDir,
        'C:\\repo\\.git\\worktrees\\feat',
        winPath,
      ),
    ).toBe(false);
    expect(
      shouldIgnoreForGitWorktreeWatch(
        winGitDir,
        'C:\\repo\\.git\\objects\\ab',
        winPath,
      ),
    ).toBe(true);
    // Per-worktree HEAD allow-list also holds with windows separators.
    expect(
      shouldIgnoreForGitWorktreeWatch(
        winGitDir,
        'C:\\repo\\.git\\worktrees\\feat\\HEAD',
        winPath,
      ),
    ).toBe(false);
  });
});

describe('git worktree watcher lifecycle', () => {
  it('starts a single shallow, event-driven watcher per repository', () => {
    const { service } = createHarness();
    ensureWatcher(service, '/repo/wt-a', '/repo/.git');

    expect(watchInstances).toHaveLength(1);
    const w = watchInstances[0] as unknown as FakeWatcherInstance;
    expect(w.watchPath).toBe('/repo/.git');
    // depth: 2 reaches `worktrees/<name>/HEAD` for branch-switch detection,
    // but the `ignored` predicate keeps it off the noisy parts of the repo.
    expect(w.options.depth).toBe(2);
    expect(w.options.ignoreInitial).toBe(true);
    expect(w.options.usePolling).toBeUndefined();
    expect(w.options.awaitWriteFinish).toBeUndefined();
  });

  it('shares one watcher across multiple mounts of the same repo', () => {
    const { service } = createHarness();
    ensureWatcher(service, '/repo/wt-a', '/repo/.git');
    ensureWatcher(service, '/repo/wt-b', '/repo/.git');

    expect(watchInstances).toHaveLength(1);
    const entry = watchersForRepo(service).get('/repo/.git');
    expect(entry?.refs.size).toBe(2);
  });

  it('only closes the watcher once every referencing mount is released', () => {
    const { service } = createHarness();
    ensureWatcher(service, '/repo/wt-a', '/repo/.git');
    ensureWatcher(service, '/repo/wt-b', '/repo/.git');
    const w = watchInstances[0] as unknown as FakeWatcherInstance;

    releaseWatcher(service, '/repo/wt-a');
    expect(w.closed).toBe(false);
    expect(watchersForRepo(service).has('/repo/.git')).toBe(true);

    releaseWatcher(service, '/repo/wt-b');
    expect(w.closed).toBe(true);
    expect(watchersForRepo(service).has('/repo/.git')).toBe(false);
  });

  it('bumps the per-repository revision (debounced) when a worktree dir is added', () => {
    const { service, state } = createHarness();
    ensureWatcher(service, '/repo/wt-a', '/repo/.git');
    const w = watchInstances[0] as unknown as FakeWatcherInstance;

    w.trigger('addDir', '/repo/.git/worktrees/feature-x');
    // Debounced — nothing yet.
    expect(state.gitWorktreeRevisions['/repo/.git']).toBeUndefined();

    vi.advanceTimersByTime(400);
    expect(state.gitWorktreeRevisions['/repo/.git']).toBe(1);
  });

  it('bumps on a HEAD change (branch switch in a linked worktree)', () => {
    const { service, state } = createHarness();
    ensureWatcher(service, '/repo/wt-a', '/repo/.git');
    const w = watchInstances[0] as unknown as FakeWatcherInstance;

    // `git switch` rewrites the worktree's HEAD file — chokidar emits `change`.
    w.trigger('change', '/repo/.git/worktrees/feature-x/HEAD');
    vi.advanceTimersByTime(400);
    expect(state.gitWorktreeRevisions['/repo/.git']).toBe(1);
  });

  it('bumps on the main worktree HEAD changing', () => {
    const { service, state } = createHarness();
    ensureWatcher(service, '/repo/wt-a', '/repo/.git');
    const w = watchInstances[0] as unknown as FakeWatcherInstance;

    w.trigger('change', '/repo/.git/HEAD');
    vi.advanceTimersByTime(400);
    expect(state.gitWorktreeRevisions['/repo/.git']).toBe(1);
  });

  it('coalesces a burst of events into a single revision bump', () => {
    const { service, state } = createHarness();
    ensureWatcher(service, '/repo/wt-a', '/repo/.git');
    const w = watchInstances[0] as unknown as FakeWatcherInstance;

    // `git worktree add` produces several rapid fs events.
    w.trigger('addDir', '/repo/.git/worktrees');
    w.trigger('addDir', '/repo/.git/worktrees/feature-x');
    vi.advanceTimersByTime(100);
    w.trigger('addDir', '/repo/.git/worktrees/feature-x');
    vi.advanceTimersByTime(400);

    expect(state.gitWorktreeRevisions['/repo/.git']).toBe(1);
  });

  it('bumps again on a later removal, and tracks repos independently', () => {
    const { service, state } = createHarness();
    ensureWatcher(service, '/repo-a/wt', '/repo-a/.git');
    ensureWatcher(service, '/repo-b/wt', '/repo-b/.git');
    const [wa, wb] = watchInstances as unknown as FakeWatcherInstance[];

    wa.trigger('addDir', '/repo-a/.git/worktrees/x');
    vi.advanceTimersByTime(400);
    wa.trigger('unlinkDir', '/repo-a/.git/worktrees/x');
    vi.advanceTimersByTime(400);

    expect(state.gitWorktreeRevisions['/repo-a/.git']).toBe(2);
    expect(state.gitWorktreeRevisions['/repo-b/.git']).toBeUndefined();

    wb.trigger('unlinkDir', '/repo-b/.git/worktrees/y');
    vi.advanceTimersByTime(400);
    expect(state.gitWorktreeRevisions['/repo-b/.git']).toBe(1);
  });
});
