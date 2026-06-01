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
    toolbox,
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
    const manager = new AgentManager({
      host: deps.host,
      commandRegistry: deps.registry,
      agentTypeRegistry: deps.agentTypeRegistry,
      startupPolicy: { kind: 'none' },
      state: {
        store: deps.agentStore as any,
        instancesWriter: deps.agentInstances as any,
      },
      storage: {
        persistenceDb: {} as any,
        attachments: {} as any,
        fileReadCache: {} as any,
      },
      tools: {
        managerToolbox: deps.toolbox as any,
        agentToolbox: deps.toolbox as any,
      },
    });

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
    const manager = new AgentManager({
      host: deps.host,
      commandRegistry: deps.registry,
      agentTypeRegistry: deps.agentTypeRegistry,
      startupPolicy: {
        kind: 'auto-create-default',
        agentType: AgentTypes.CHAT,
        mountLastWorkspaces: true,
      },
      state: {
        store: deps.agentStore as any,
        instancesWriter: deps.agentInstances as any,
      },
      storage: {
        persistenceDb: agentDb as any,
        attachments: {} as any,
        fileReadCache: {} as any,
      },
      tools: {
        managerToolbox: deps.toolbox as any,
        agentToolbox: deps.toolbox as any,
      },
    });

    for (let i = 0; i < 6; i++) {
      await flush();
      if (deps.toolbox.handleMountWorkspace.mock.calls.length === 2) break;
    }
    expect(createAgentSpy).toHaveBeenCalledWith(AgentTypes.CHAT, undefined);
    expect(deps.toolbox.handleMountWorkspace).toHaveBeenCalledTimes(2);
    await manager.teardown();
  });
});
