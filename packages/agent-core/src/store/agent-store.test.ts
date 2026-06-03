import { describe, expect, it, vi } from 'vitest';
import { AgentTypes } from '../types/agent';
import { AgentStore } from './agent-store';
import type { AgentSystemState } from './state';

function makeInitialState(): AgentSystemState {
  return {
    agents: {
      instances: {
        'agent-1': {
          type: AgentTypes.CHAT,
          canSelectModel: true,
          requiredModelCapabilities: {},
          allowUserInput: true,
          parentAgentInstanceId: null,
          state: {
            title: 'initial',
            isWorking: false,
            history: [],
            queuedMessages: [],
            activeModelId: 'model-a',
            pendingApprovals: {},
            inputState: '',
            usedTokens: 0,
          },
        },
      },
    },
    toolbox: {
      'agent-1': {
        workspace: { mounts: [] },
        pendingFileDiffs: [],
        editSummary: [],
        pendingUserQuestion: null,
      },
    },
  };
}

describe('AgentStore', () => {
  it('returns the initial state from get()', () => {
    const initial = makeInitialState();
    const store = new AgentStore(initial);
    expect(store.get()).toBe(initial);
  });

  it('applies an Immer recipe via update() and exposes the new state', () => {
    const store = new AgentStore(makeInitialState());
    store.update((draft) => {
      draft.agents.instances['agent-1']!.state.title = 'updated';
    });
    expect(store.get().agents.instances['agent-1']!.state.title).toBe(
      'updated',
    );
  });

  it('does not invoke subscribers when the recipe performs no mutation', () => {
    const store = new AgentStore(makeInitialState());
    const listener = vi.fn();
    store.subscribe(listener);
    store.update(() => {
      // no-op
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('passes Immer patches describing the mutation to subscribers', () => {
    const store = new AgentStore(makeInitialState());
    const listener = vi.fn();
    store.subscribe(listener);

    store.update((draft) => {
      draft.agents.instances['agent-1']!.state.title = 'patched';
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const [, , patches] = listener.mock.calls[0]!;
    expect(Array.isArray(patches)).toBe(true);
    expect(patches.length).toBeGreaterThan(0);

    // Patches describe the exact mutation path so downstream
    // projections (notably the Karton bridge) can forward granular
    // changes instead of replacing whole subtrees.
    const titlePatch = (patches as { path: (string | number)[] }[]).find(
      (p) =>
        p.path.length === 5 &&
        p.path[0] === 'agents' &&
        p.path[1] === 'instances' &&
        p.path[2] === 'agent-1' &&
        p.path[3] === 'state' &&
        p.path[4] === 'title',
    );
    expect(titlePatch).toBeDefined();
  });

  it('exposes multiple slice mutations atomically to subscribers', () => {
    const store = new AgentStore(makeInitialState());
    const seen: Array<AgentSystemState> = [];
    store.subscribe((state) => {
      seen.push(state);
    });

    store.update((draft) => {
      draft.agents.instances['agent-1']!.state.title = 'atomic';
      draft.toolbox['agent-1']!.pendingFileDiffs = [];
      draft.agents.instances['agent-1']!.state.isWorking = true;
    });

    expect(seen).toHaveLength(1);
    const [post] = seen;
    expect(post!.agents.instances['agent-1']!.state.title).toBe('atomic');
    expect(post!.agents.instances['agent-1']!.state.isWorking).toBe(true);
  });

  it('unsubscribe function removes the listener', () => {
    const store = new AgentStore(makeInitialState());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.update((draft) => {
      draft.agents.instances['agent-1']!.state.title = 'a';
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.update((draft) => {
      draft.agents.instances['agent-1']!.state.title = 'b';
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('registerSideEffect handle resolves after the listener promise settles', async () => {
    const store = new AgentStore(makeInitialState());
    let resolveListener!: () => void;
    const listenerPromise = new Promise<void>((resolve) => {
      resolveListener = resolve;
    });
    const handle = store.registerSideEffect(async () => {
      await listenerPromise;
    });

    store.update((draft) => {
      draft.agents.instances['agent-1']!.state.title = 'side-effect';
    });

    let settled = false;
    const readiness = handle.readiness().then(() => {
      settled = true;
    });

    // Not yet settled — listener promise has not resolved.
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveListener();
    await readiness;
    expect(settled).toBe(true);
  });

  it('whenSettled awaits all side-effect promises from the most recent update', async () => {
    const store = new AgentStore(makeInitialState());
    let resolveA!: () => void;
    let resolveB!: () => void;
    store.registerSideEffect(
      () =>
        new Promise<void>((resolve) => {
          resolveA = resolve;
        }),
    );
    store.registerSideEffect(
      () =>
        new Promise<void>((resolve) => {
          resolveB = resolve;
        }),
    );

    store.update((draft) => {
      draft.agents.instances['agent-1']!.state.title = 'settle';
    });

    let done = false;
    const settled = store.whenSettled().then(() => {
      done = true;
    });

    await Promise.resolve();
    expect(done).toBe(false);
    resolveA();
    await Promise.resolve();
    expect(done).toBe(false);
    resolveB();
    await settled;
    expect(done).toBe(true);
  });

  it('nested update() throws', () => {
    const store = new AgentStore(makeInitialState());
    store.subscribe(() => {
      store.update((draft) => {
        draft.agents.instances['agent-1']!.state.title = 'nested';
      });
    });

    expect(() =>
      store.update((draft) => {
        draft.agents.instances['agent-1']!.state.title = 'outer';
      }),
    ).toThrow(/nested AgentStore\.update is not allowed/);
  });

  it('propagates subscriber errors synchronously out of update()', () => {
    const store = new AgentStore(makeInitialState());
    store.subscribe(() => {
      throw new Error('boom');
    });
    expect(() =>
      store.update((draft) => {
        draft.agents.instances['agent-1']!.state.title = 'err';
      }),
    ).toThrow(/boom/);
  });

  it('side-effect listener errors surface on readiness() and whenSettled()', async () => {
    const store = new AgentStore(makeInitialState());
    const handle = store.registerSideEffect(async () => {
      throw new Error('side-effect failure');
    });

    store.update((draft) => {
      draft.agents.instances['agent-1']!.state.title = 'err';
    });

    await expect(handle.readiness()).rejects.toThrow(/side-effect failure/);
    await expect(store.whenSettled()).rejects.toThrow(/side-effect failure/);
  });

  it('synchronous side-effect listener throw surfaces on readiness()', async () => {
    const store = new AgentStore(makeInitialState());
    const handle = store.registerSideEffect(() => {
      throw new Error('sync throw');
    });

    store.update((draft) => {
      draft.agents.instances['agent-1']!.state.title = 'err';
    });

    await expect(handle.readiness()).rejects.toThrow(/sync throw/);
  });
});
