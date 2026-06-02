import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentManager } from './agent-manager';
import { CommandRegistry } from '../../commands/command-registry';
import { AgentTypeRegistry } from '../../agents/agents-registry';
import { AgentTypes } from '../../types/agent';
import { createTestAgentHost } from '../../host/test-utils';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function createDeps() {
  const toolbox = {
    handleMountWorkspace: vi.fn(async () => {}),
    cancelQuestion: vi.fn(),
    getWorkspaceSnapshotForPersistence: vi.fn(() => []),
    setWorkspaceMdContent: vi.fn(),
    acceptAllPendingEditsForAgent: vi.fn(async () => {}),
    getEditedFilePathsForAgent: vi.fn(async () => []),
    // Default to identity mapping; specific tests override per-call.
    resolveNewAgentMountPath: vi.fn(async (p: string) => `MAIN(${p})`),
  };
  const persistenceDb = {
    getLastChatWorkspacePaths: vi.fn(async () => null),
  };
  return {
    registry: new CommandRegistry(),
    toolbox,
    persistenceDb,
    agentStore: {
      get: vi.fn(() => ({ agents: { instances: {} }, toolbox: {} })),
      update: vi.fn(),
    },
    host: createTestAgentHost(),
    agentTypeRegistry: new AgentTypeRegistry(),
  };
}

function buildManager(deps: ReturnType<typeof createDeps>) {
  return new AgentManager({
    host: deps.host,
    commandRegistry: deps.registry,
    agentTypeRegistry: deps.agentTypeRegistry,
    startupPolicy: { kind: 'none' },
    state: { store: deps.agentStore as any },
    storage: {
      persistenceDb: deps.persistenceDb as any,
      attachments: {} as any,
      fileReadCache: {} as any,
    },
    tools: {
      managerToolbox: deps.toolbox as any,
      agentToolbox: deps.toolbox as any,
    },
  });
}

describe('AgentManager agents.create handler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('threads modelId and toolApprovalMode into createAgent initialState', async () => {
    const createAgentSpy = vi
      .spyOn(AgentManager.prototype, 'createAgent')
      .mockResolvedValue({ instanceId: 'a1' } as any);

    const deps = createDeps();
    const manager = buildManager(deps);
    await flush();

    const id = await deps.registry.dispatch<unknown[], string>(
      'agents.create',
      { callerId: 'test' },
      ['hello', 'claude-sonnet-4.6', 'smart', undefined, undefined],
    );

    expect(id).toBe('a1');
    expect(createAgentSpy).toHaveBeenCalledTimes(1);
    const args = createAgentSpy.mock.calls[0]!;
    // Positional contract: (type, instanceConfig, parent, initialState, instanceId, initialInputState)
    expect(args[0]).toBe(AgentTypes.CHAT);
    expect(args[3]).toEqual({
      activeModelId: 'claude-sonnet-4.6',
      toolApprovalMode: 'smart',
    });
    expect(args[5]).toBe('hello');

    await manager.teardown();
  });

  it('preserves an explicit alwaysAllow toolApprovalMode', async () => {
    const createAgentSpy = vi
      .spyOn(AgentManager.prototype, 'createAgent')
      .mockResolvedValue({ instanceId: 'a2' } as any);

    const deps = createDeps();
    const manager = buildManager(deps);
    await flush();

    await deps.registry.dispatch<unknown[], string>(
      'agents.create',
      { callerId: 'test' },
      [undefined, undefined, 'alwaysAllow', undefined, undefined],
    );

    expect(createAgentSpy.mock.calls[0]?.[3]).toEqual({
      toolApprovalMode: 'alwaysAllow',
    });

    await manager.teardown();
  });

  it('remaps explicit workspacePaths via resolveNewAgentMountPath by default', async () => {
    vi.spyOn(AgentManager.prototype, 'createAgent').mockResolvedValue({
      instanceId: 'a3',
    } as any);

    const deps = createDeps();
    const manager = buildManager(deps);
    await flush();

    await deps.registry.dispatch<unknown[], void>(
      'agents.create',
      { callerId: 'test' },
      [undefined, undefined, undefined, ['/repos/linked/feature-x'], undefined],
    );

    expect(deps.toolbox.resolveNewAgentMountPath).toHaveBeenCalledWith(
      '/repos/linked/feature-x',
    );
    expect(deps.toolbox.handleMountWorkspace).toHaveBeenCalledWith(
      'a3',
      'MAIN(/repos/linked/feature-x)',
    );

    await manager.teardown();
  });

  it('bypasses remap when preserveWorkspacePaths is true', async () => {
    vi.spyOn(AgentManager.prototype, 'createAgent').mockResolvedValue({
      instanceId: 'a4',
    } as any);

    const deps = createDeps();
    const manager = buildManager(deps);
    await flush();

    await deps.registry.dispatch<unknown[], void>(
      'agents.create',
      { callerId: 'test' },
      [undefined, undefined, undefined, ['/repos/linked/feature-x'], true],
    );

    expect(deps.toolbox.resolveNewAgentMountPath).not.toHaveBeenCalled();
    expect(deps.toolbox.handleMountWorkspace).toHaveBeenCalledWith(
      'a4',
      '/repos/linked/feature-x',
    );

    await manager.teardown();
  });

  it('falls back to passing the path verbatim when the port has no resolver', async () => {
    vi.spyOn(AgentManager.prototype, 'createAgent').mockResolvedValue({
      instanceId: 'a5',
    } as any);

    const deps = createDeps();
    // Simulate a host (e.g. CLI) that does not implement the optional hook.
    (deps.toolbox as any).resolveNewAgentMountPath = undefined;

    const manager = buildManager(deps);
    await flush();

    await deps.registry.dispatch<unknown[], void>(
      'agents.create',
      { callerId: 'test' },
      [undefined, undefined, undefined, ['/anywhere'], undefined],
    );

    expect(deps.toolbox.handleMountWorkspace).toHaveBeenCalledWith(
      'a5',
      '/anywhere',
    );

    await manager.teardown();
  });

  it('applies the remap to the last-workspaces fallback when no explicit paths are passed', async () => {
    vi.spyOn(AgentManager.prototype, 'createAgent').mockResolvedValue({
      instanceId: 'a6',
    } as any);

    const deps = createDeps();
    deps.persistenceDb.getLastChatWorkspacePaths = vi.fn(async () => [
      { path: '/repos/linked/last', permissions: [] },
    ]) as any;

    const manager = buildManager(deps);
    await flush();

    await deps.registry.dispatch<unknown[], void>(
      'agents.create',
      { callerId: 'test' },
      [undefined, undefined, undefined, undefined, undefined],
    );

    expect(deps.toolbox.resolveNewAgentMountPath).toHaveBeenCalledWith(
      '/repos/linked/last',
    );
    expect(deps.toolbox.handleMountWorkspace).toHaveBeenCalledWith(
      'a6',
      'MAIN(/repos/linked/last)',
      [],
    );

    await manager.teardown();
  });
});
