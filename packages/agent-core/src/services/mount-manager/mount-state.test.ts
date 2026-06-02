import { describe, expect, it, vi } from 'vitest';
import { AgentStore, createInitialAgentSystemState } from '../../store';
import type { MountEntry } from '../../types/metadata';
import { setAgentMounts } from './mount-state';

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

describe('setAgentMounts', () => {
  it('seeds the toolbox entry with the scaffolding shape on first write', () => {
    const store = new AgentStore(createInitialAgentSystemState());
    const entry = makeEntry();

    setAgentMounts(store, 'a1', [entry]);

    const toolboxEntry = store.get().toolbox.a1;
    expect(toolboxEntry).toBeDefined();
    expect(toolboxEntry!.workspace).toEqual({ mounts: [entry] });
    expect(toolboxEntry!.pendingFileDiffs).toEqual([]);
    expect(toolboxEntry!.editSummary).toEqual([]);
    expect(toolboxEntry!.pendingUserQuestion).toBeNull();
  });

  it('replaces the mounts array reference cleanly on subsequent writes', () => {
    const store = new AgentStore(createInitialAgentSystemState());

    const first = [makeEntry({ prefix: 'w1', path: '/repos/alpha' })];
    const second = [
      makeEntry({ prefix: 'w1', path: '/repos/alpha' }),
      makeEntry({ prefix: 'w2', path: '/repos/beta' }),
    ];

    setAgentMounts(store, 'a1', first);
    const afterFirst = store.get().toolbox.a1!.workspace.mounts;
    expect(afterFirst).toBe(first);

    setAgentMounts(store, 'a1', second);
    const afterSecond = store.get().toolbox.a1!.workspace.mounts;
    expect(afterSecond).toBe(second);
    expect(afterSecond).not.toBe(afterFirst);
    expect(afterSecond).toHaveLength(2);
  });

  it('emits exactly one subscriber notification per call', () => {
    const store = new AgentStore(createInitialAgentSystemState());
    const subscriber = vi.fn();
    const unsubscribe = store.subscribe(subscriber);

    setAgentMounts(store, 'a1', [makeEntry()]);
    expect(subscriber).toHaveBeenCalledTimes(1);

    setAgentMounts(store, 'a1', [makeEntry(), makeEntry({ prefix: 'w2' })]);
    expect(subscriber).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('replaces workspace as a whole object (reference changes on every write)', () => {
    const store = new AgentStore(createInitialAgentSystemState());

    setAgentMounts(store, 'a1', [makeEntry()]);
    const workspaceAfterFirst = store.get().toolbox.a1!.workspace;

    setAgentMounts(store, 'a1', [makeEntry()]);
    const workspaceAfterSecond = store.get().toolbox.a1!.workspace;

    expect(workspaceAfterSecond).not.toBe(workspaceAfterFirst);
  });

  it('isolates writes between agent instances', () => {
    const store = new AgentStore(createInitialAgentSystemState());

    setAgentMounts(store, 'a1', [makeEntry({ prefix: 'w1' })]);
    setAgentMounts(store, 'a2', [makeEntry({ prefix: 'w9' })]);

    expect(store.get().toolbox.a1!.workspace.mounts[0]!.prefix).toBe('w1');
    expect(store.get().toolbox.a2!.workspace.mounts[0]!.prefix).toBe('w9');
  });
});
