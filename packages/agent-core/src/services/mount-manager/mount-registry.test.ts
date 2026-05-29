import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { MountManager, mountPrefixForPath } from './mount-registry';
import type { MountsStateController } from './mounts-state-controller';
import type { MountManagerHostHooks } from './types';
import type { MountEntry } from '../../types/metadata';
import type { Logger } from '../../host/logger';
import type { TelemetrySink } from '../../host/telemetry';
import { pickOwningWorkspace } from '../../workspace';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

class StubMountsController implements MountsStateController {
  public writes: Array<{ agentId: string; mounts: MountEntry[] }> = [];
  private state: Map<string, MountEntry[]> = new Map();

  setMounts(agentInstanceId: string, mounts: MountEntry[]): void {
    this.writes.push({ agentId: agentInstanceId, mounts });
    this.state.set(agentInstanceId, mounts);
  }

  getMounts(agentInstanceId: string): MountEntry[] {
    return this.state.get(agentInstanceId) ?? [];
  }
}

function makeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeTelemetry(): TelemetrySink & {
  capture: ReturnType<typeof vi.fn>;
  captureException: ReturnType<typeof vi.fn>;
} {
  return {
    capture: vi.fn(),
    captureException: vi.fn(),
  };
}

interface MakeManagerOpts {
  hooks?: Partial<MountManagerHostHooks>;
}

function makeManager(
  store: StubMountsController,
  telemetry: ReturnType<typeof makeTelemetry>,
  opts: MakeManagerOpts = {},
): { manager: MountManager; hooks: Required<MountManagerHostHooks> } {
  const hooks: Required<MountManagerHostHooks> = {
    onWorkspaceAttached: vi.fn(async () => {}),
    onWorkspaceReleased: vi.fn(),
    onMountsChanged: vi.fn(),
    ...opts.hooks,
  } as Required<MountManagerHostHooks>;

  const manager = new MountManager({
    store,
    logger: makeLogger(),
    telemetry,
    hooks,
    getAgentType: () => 'test-agent',
  });
  return { manager, hooks };
}

// ---------------------------------------------------------------------------
// Registry behavior (no real filesystem)
// ---------------------------------------------------------------------------

describe('MountManager registry (unit)', () => {
  let tempDir: string;

  beforeEach(() => {
    // Each test gets a unique, empty temp dir so the workspace-info
    // reads resolve to "no WORKSPACE.md / AGENTS.md / skills" rather
    // than reaching into a real repo.
    tempDir = mkdtempSync(path.join(tmpdir(), 'mount-registry-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function tempWorkspace(name: string): string {
    const p = path.join(tempDir, name);
    mkdirSync(p, { recursive: true });
    return p;
  }

  it('mountWorkspace writes a fresh array with a fresh entry through the store', async () => {
    const store = new StubMountsController();
    const telemetry = makeTelemetry();
    const { manager } = makeManager(store, telemetry);

    const ws = tempWorkspace('alpha');
    await manager.mountWorkspace('agent-1', ws);

    expect(store.writes).toHaveLength(1);
    const write = store.writes[0]!;
    expect(write.agentId).toBe('agent-1');
    expect(write.mounts).toHaveLength(1);

    const entry = write.mounts[0]!;
    expect(entry.prefix).toBe(mountPrefixForPath(ws));
    expect(entry.path).toBe(ws);
    expect(entry.skills).toEqual([]);
    expect(entry.workspaceMdContent).toBeNull();
    expect(entry.agentsMdContent).toBeNull();

    // Fresh array per write so the Karton-mirror reference diff fires,
    // even though unchanged per-entry objects are deliberately reused.
    await manager.mountWorkspace('agent-1', tempWorkspace('beta'));
    expect(store.writes).toHaveLength(2);
    expect(store.writes[1]!.mounts).not.toBe(store.writes[0]!.mounts);
    expect(store.writes[1]!.mounts).toHaveLength(2);
  });

  it('mountWorkspace is idempotent per (agent, path) pair', async () => {
    const store = new StubMountsController();
    const telemetry = makeTelemetry();
    const { manager, hooks } = makeManager(store, telemetry);

    const ws = tempWorkspace('alpha');
    await manager.mountWorkspace('agent-1', ws);
    await manager.mountWorkspace('agent-1', ws);

    // Second call bails before any write / hook fires.
    expect(store.writes).toHaveLength(1);
    expect(hooks.onWorkspaceAttached).toHaveBeenCalledTimes(1);
    expect(hooks.onMountsChanged).toHaveBeenCalledTimes(1);
    expect(telemetry.capture).toHaveBeenCalledTimes(1);
  });

  it('onWorkspaceAttached fires exactly once per unique path across agents', async () => {
    const store = new StubMountsController();
    const telemetry = makeTelemetry();
    const { manager, hooks } = makeManager(store, telemetry);

    const ws = tempWorkspace('shared');
    await manager.mountWorkspace('agent-1', ws);
    await manager.mountWorkspace('agent-2', ws);

    expect(hooks.onWorkspaceAttached).toHaveBeenCalledTimes(1);
    expect(hooks.onWorkspaceAttached).toHaveBeenCalledWith(ws);
  });

  it('onWorkspaceReleased fires exactly once when the last agent unmounts', async () => {
    const store = new StubMountsController();
    const telemetry = makeTelemetry();
    const { manager, hooks } = makeManager(store, telemetry);

    const ws = tempWorkspace('shared');
    await manager.mountWorkspace('agent-1', ws);
    await manager.mountWorkspace('agent-2', ws);

    const prefix = mountPrefixForPath(ws);
    manager.unmountWorkspace('agent-1', prefix);
    expect(hooks.onWorkspaceReleased).not.toHaveBeenCalled();

    manager.unmountWorkspace('agent-2', prefix);
    expect(hooks.onWorkspaceReleased).toHaveBeenCalledTimes(1);
    expect(hooks.onWorkspaceReleased).toHaveBeenCalledWith(ws);
  });

  it('unmountWorkspace removes the entry and writes a fresh array', async () => {
    const store = new StubMountsController();
    const telemetry = makeTelemetry();
    const { manager } = makeManager(store, telemetry);

    const wsA = tempWorkspace('alpha');
    const wsB = tempWorkspace('beta');
    await manager.mountWorkspace('agent-1', wsA);
    await manager.mountWorkspace('agent-1', wsB);

    const writesBefore = store.writes.length;
    manager.unmountWorkspace('agent-1', mountPrefixForPath(wsA));
    expect(store.writes.length).toBeGreaterThan(writesBefore);

    const last = store.writes[store.writes.length - 1]!;
    expect(last.mounts.map((m) => m.path)).toEqual([wsB]);
    // Fresh array identity on every write.
    expect(last.mounts).not.toBe(store.writes[store.writes.length - 2]!.mounts);
  });

  it('clearAgentMounts releases orphan paths and drops every prefix', async () => {
    const store = new StubMountsController();
    const telemetry = makeTelemetry();
    const { manager, hooks } = makeManager(store, telemetry);

    const wsShared = tempWorkspace('shared');
    const wsSolo = tempWorkspace('solo');
    await manager.mountWorkspace('agent-1', wsShared);
    await manager.mountWorkspace('agent-1', wsSolo);
    await manager.mountWorkspace('agent-2', wsShared);

    (hooks.onWorkspaceReleased as ReturnType<typeof vi.fn>).mockClear();
    manager.clearAgentMounts('agent-1');

    expect(manager.getMountPrefixes('agent-1')).toBeUndefined();
    // solo is released (no other ref), shared stays mounted via agent-2.
    expect(hooks.onWorkspaceReleased).toHaveBeenCalledTimes(1);
    expect(hooks.onWorkspaceReleased).toHaveBeenCalledWith(wsSolo);
    expect(manager.getAllMountedPaths().has(wsShared)).toBe(true);
    expect(manager.getAllMountedPaths().has(wsSolo)).toBe(false);
  });

  it('captures workspace-mounted / workspace-unmounted telemetry with agent_type + id', async () => {
    const store = new StubMountsController();
    const telemetry = makeTelemetry();
    const { manager } = makeManager(store, telemetry);

    const ws = tempWorkspace('alpha');
    await manager.mountWorkspace('agent-1', ws);
    manager.unmountWorkspace('agent-1', mountPrefixForPath(ws));

    expect(telemetry.capture).toHaveBeenCalledWith('workspace-mounted', {
      agent_type: 'test-agent',
      agent_instance_id: 'agent-1',
    });
    expect(telemetry.capture).toHaveBeenCalledWith('workspace-unmounted', {
      agent_type: 'test-agent',
      agent_instance_id: 'agent-1',
    });
  });

  it('getMountPrefixes / getWorkspacePathForPrefix / findWorkspaceForFile return expected values', async () => {
    const store = new StubMountsController();
    const telemetry = makeTelemetry();
    const { manager } = makeManager(store, telemetry);

    const wsA = tempWorkspace('alpha');
    const wsB = tempWorkspace('beta');
    await manager.mountWorkspace('agent-1', wsA);
    await manager.mountWorkspace('agent-1', wsB);

    const prefixes = manager.getMountPrefixes('agent-1')!;
    expect(prefixes).toHaveLength(2);
    expect(new Set(prefixes)).toEqual(
      new Set([mountPrefixForPath(wsA), mountPrefixForPath(wsB)]),
    );

    expect(manager.getWorkspacePathForPrefix(mountPrefixForPath(wsA))).toBe(
      wsA,
    );

    const filePath = path.join(wsA, 'src', 'index.ts');
    expect(manager.findWorkspaceForFile('agent-1', filePath)).toBe(wsA);

    // Sanity: shares implementation with the pure resolver.
    expect(pickOwningWorkspace(filePath, [wsA, wsB])).toBe(wsA);
  });

  it('setWorkspaceMdContent rebuilds mount entries with a fresh MountEntry', async () => {
    const store = new StubMountsController();
    const telemetry = makeTelemetry();
    const { manager } = makeManager(store, telemetry);

    const ws = tempWorkspace('alpha');
    await manager.mountWorkspace('agent-1', ws);
    const before = store.writes[store.writes.length - 1]!.mounts[0]!;

    manager.setWorkspaceMdContent(ws, 'hello world');

    const after = store.writes[store.writes.length - 1]!.mounts[0]!;
    expect(after.workspaceMdContent).toBe('hello world');
    // Fresh entry identity so Karton-mirror reference diff fires.
    expect(after).not.toBe(before);
  });

  it('does not fire onMountsChanged when a redundant mount is requested', async () => {
    const store = new StubMountsController();
    const telemetry = makeTelemetry();
    const { manager, hooks } = makeManager(store, telemetry);

    const ws = tempWorkspace('alpha');
    await manager.mountWorkspace('agent-1', ws);
    (hooks.onMountsChanged as ReturnType<typeof vi.fn>).mockClear();

    await manager.mountWorkspace('agent-1', ws);
    expect(hooks.onMountsChanged).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Watcher-driven refresh (real filesystem, real chokidar, real timers)
// ---------------------------------------------------------------------------

describe('MountManager watcher refresh (integration)', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.useRealTimers();
    tempDir = mkdtempSync(path.join(tmpdir(), 'mount-registry-watch-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('rewriting .stagewise/WORKSPACE.md triggers a debounced second write with updated content', async () => {
    const store = new StubMountsController();
    const telemetry = makeTelemetry();
    const { manager } = makeManager(store, telemetry);

    const ws = path.join(tempDir, 'alpha');
    mkdirSync(path.join(ws, '.stagewise'), { recursive: true });
    const wsMdPath = path.join(ws, '.stagewise', 'WORKSPACE.md');
    writeFileSync(wsMdPath, 'first', 'utf-8');

    await manager.mountWorkspace('agent-1', ws);
    const writesAfterMount = store.writes.length;
    expect(
      store.writes[writesAfterMount - 1]!.mounts[0]!.workspaceMdContent,
    ).toBe('first');

    // Give chokidar a beat to attach to the ready handler (ignoreInitial
    // means the attach-time reads don't fire watcher events).
    await new Promise((r) => setTimeout(r, 200));
    writeFileSync(wsMdPath, 'second', 'utf-8');

    // 400 ms debounce + 150 ms awaitWriteFinish stability + slack.
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const latest = store.writes[store.writes.length - 1]!;
      if (latest.mounts[0]?.workspaceMdContent === 'second') break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const finalWrite = store.writes[store.writes.length - 1]!;
    expect(finalWrite.mounts[0]!.workspaceMdContent).toBe('second');
    expect(store.writes.length).toBeGreaterThan(writesAfterMount);

    await manager.teardownWatchers();
  }, 10_000);
});
