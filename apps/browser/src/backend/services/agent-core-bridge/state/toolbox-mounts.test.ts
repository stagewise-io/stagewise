import {
  AgentStore,
  createInitialAgentSystemState,
  type MountEntry,
} from '@stagewise/agent-core';
import { describe, it, expect, vi } from 'vitest';
import { createMountsStateController } from './toolbox-mounts';

/**
 * Test fixture — a fully-populated `MountEntry`. Individual tests clone
 * and mutate specific fields to simulate the real service's fresh-object
 * contract for per-field updates.
 */
function makeEntry(overrides: Partial<MountEntry> = {}): MountEntry {
  return {
    prefix: 'w1',
    path: '/repos/alpha',
    git: null,
    skills: [],
    workspaceMdContent: null,
    agentsMdContent: null,
    ...overrides,
  };
}

describe('MountsStateController', () => {
  it('seeds the toolbox entry with the scaffolding shape on first write', () => {
    const store = new AgentStore(createInitialAgentSystemState());
    const controller = createMountsStateController(store);
    const entry = makeEntry();

    controller.setMounts('a1', [entry]);

    const toolboxEntry = store.get().toolbox.a1;
    expect(toolboxEntry).toBeDefined();
    expect(toolboxEntry!.workspace).toEqual({ mounts: [entry] });
    expect(toolboxEntry!.pendingFileDiffs).toEqual([]);
    expect(toolboxEntry!.editSummary).toEqual([]);
    expect(toolboxEntry!.pendingUserQuestion).toBeNull();
  });

  it('replaces the mounts array reference cleanly on subsequent writes', () => {
    const store = new AgentStore(createInitialAgentSystemState());
    const controller = createMountsStateController(store);

    const first = [makeEntry({ prefix: 'w1', path: '/repos/alpha' })];
    const second = [
      makeEntry({ prefix: 'w1', path: '/repos/alpha' }),
      makeEntry({ prefix: 'w2', path: '/repos/beta' }),
    ];

    controller.setMounts('a1', first);
    const afterFirst = store.get().toolbox.a1!.workspace.mounts;
    expect(afterFirst).toBe(first);

    controller.setMounts('a1', second);
    const afterSecond = store.get().toolbox.a1!.workspace.mounts;
    expect(afterSecond).toBe(second);
    expect(afterSecond).not.toBe(afterFirst);
    expect(afterSecond).toHaveLength(2);
  });

  it('returns an empty array from getMounts for unknown agent ids', () => {
    const store = new AgentStore(createInitialAgentSystemState());
    const controller = createMountsStateController(store);

    expect(controller.getMounts('nonexistent')).toEqual([]);
  });

  it('returns the live mounts array after a write', () => {
    const store = new AgentStore(createInitialAgentSystemState());
    const controller = createMountsStateController(store);
    const entries = [makeEntry()];

    controller.setMounts('a1', entries);
    expect(controller.getMounts('a1')).toBe(entries);
  });

  it('emits exactly one subscriber notification per setMounts call', () => {
    const store = new AgentStore(createInitialAgentSystemState());
    const controller = createMountsStateController(store);
    const subscriber = vi.fn();
    const unsubscribe = store.subscribe(subscriber);

    controller.setMounts('a1', [makeEntry()]);
    expect(subscriber).toHaveBeenCalledTimes(1);

    controller.setMounts('a1', [makeEntry(), makeEntry({ prefix: 'w2' })]);
    expect(subscriber).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('replaces workspace as a whole object (reference changes on every write)', () => {
    const store = new AgentStore(createInitialAgentSystemState());
    const controller = createMountsStateController(store);

    controller.setMounts('a1', [makeEntry()]);
    const workspaceAfterFirst = store.get().toolbox.a1!.workspace;

    controller.setMounts('a1', [makeEntry()]);
    const workspaceAfterSecond = store.get().toolbox.a1!.workspace;

    expect(workspaceAfterSecond).not.toBe(workspaceAfterFirst);
  });

  it('isolates writes between agent instances', () => {
    const store = new AgentStore(createInitialAgentSystemState());
    const controller = createMountsStateController(store);

    controller.setMounts('a1', [makeEntry({ prefix: 'w1' })]);
    controller.setMounts('a2', [makeEntry({ prefix: 'w9' })]);

    expect(controller.getMounts('a1')[0]!.prefix).toBe('w1');
    expect(controller.getMounts('a2')[0]!.prefix).toBe('w9');
  });
});
