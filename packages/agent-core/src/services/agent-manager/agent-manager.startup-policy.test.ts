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
  };
  return {
    registry: new CommandRegistry(),
    telemetry: {
      telemetryLevel: 'basic',
      capture: vi.fn(),
      captureException: vi.fn(),
    },
    toolbox,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    modelCatalog: {
      modelExists: vi.fn(() => true),
    },
    agentInstances: {
      upsertInstance: vi.fn(),
      deleteInstance: vi.fn(),
      getInstance: vi.fn(),
      buildCommands: vi.fn(() => ({})),
      setToolApprovalMode: vi.fn(),
    },
    agentStore: {
      get: vi.fn(() => ({ agents: { instances: {} }, toolbox: {} })),
    },
    host: createTestAgentHost(),
    agentTypeRegistry: new AgentTypeRegistry(),
  };
}

describe('AgentManager startup policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not auto-create when policy is none', async () => {
    const createAgentSpy = vi
      .spyOn(AgentManager.prototype, 'createAgent')
      .mockResolvedValue({ instanceId: 'a' } as any);

    const deps = createDeps();
    const manager = new AgentManager(
      deps.registry,
      deps.telemetry as any,
      deps.toolbox as any,
      deps.toolbox as any,
      deps.logger as any,
      deps.modelCatalog as any,
      deps.agentInstances as any,
      deps.agentStore as any,
      () => [],
      { kind: 'none' },
      {} as any,
      {} as any,
      {} as any,
      deps.host as any,
      deps.agentTypeRegistry,
    );

    await flush();
    expect(createAgentSpy).not.toHaveBeenCalled();
    await manager.teardown();
  });

  it('auto-creates default agent and mounts workspaces when configured', async () => {
    const agentDb = {
      getLastChatWorkspacePaths: vi.fn(async () => [
        { path: '/ws/a', permissions: [] },
        { path: '/ws/b', permissions: [] },
      ]),
    };
    const createAgentSpy = vi
      .spyOn(AgentManager.prototype, 'createAgent')
      .mockResolvedValue({ instanceId: 'seed-agent' } as any);

    const deps = createDeps();
    const manager = new AgentManager(
      deps.registry,
      deps.telemetry as any,
      deps.toolbox as any,
      deps.toolbox as any,
      deps.logger as any,
      deps.modelCatalog as any,
      deps.agentInstances as any,
      deps.agentStore as any,
      () => [],
      {
        kind: 'auto-create-default',
        agentType: AgentTypes.CHAT,
        mountLastWorkspaces: true,
      },
      {} as any,
      {} as any,
      agentDb as any,
      deps.host as any,
      deps.agentTypeRegistry,
    );

    for (let i = 0; i < 6; i++) {
      await flush();
      if (deps.toolbox.handleMountWorkspace.mock.calls.length === 2) break;
    }
    expect(createAgentSpy).toHaveBeenCalledWith(AgentTypes.CHAT, undefined);
    expect(deps.toolbox.handleMountWorkspace).toHaveBeenCalledTimes(2);
    await manager.teardown();
  });
});
