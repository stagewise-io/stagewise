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
    // Minimal `AgentStore`-shaped stub. `AgentManager` only reaches
    // `get` / `update` on the store via the `state-mutations` helpers,
    // and the startup-policy paths covered here never call the
    // per-instance setters — so no-op `update` is sufficient.
    agentStore: {
      get: vi.fn(() => ({ agents: { instances: {} }, toolbox: {} })),
      update: vi.fn(),
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

  it('resumes the previously-active agent and skips the create + mount fallback', async () => {
    const agentDb = {
      getLastChatWorkspacePaths: vi.fn(async () => [
        { path: '/ws/x', permissions: [] },
      ]),
    };
    const createAgentSpy = vi
      .spyOn(AgentManager.prototype, 'createAgent')
      .mockResolvedValue({ instanceId: 'should-not-be-created' } as any);
    const resumeAgentSpy = vi
      .spyOn(AgentManager.prototype, 'resumeAgent')
      .mockResolvedValue({ instanceId: 'restored-agent' } as any);
    const getResumeAgentId = vi.fn(() => 'restored-agent');

    const deps = createDeps();
    const manager = new AgentManager({
      host: deps.host,
      commandRegistry: deps.registry,
      agentTypeRegistry: deps.agentTypeRegistry,
      startupPolicy: {
        kind: 'auto-create-default',
        agentType: AgentTypes.CHAT,
        mountLastWorkspaces: true,
        getResumeAgentId,
      },
      state: {
        store: deps.agentStore as any,
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
      if (resumeAgentSpy.mock.calls.length === 1) break;
    }
    expect(getResumeAgentId).toHaveBeenCalledTimes(1);
    expect(resumeAgentSpy).toHaveBeenCalledWith('restored-agent');
    expect(createAgentSpy).not.toHaveBeenCalled();
    expect(agentDb.getLastChatWorkspacePaths).not.toHaveBeenCalled();
    expect(deps.toolbox.handleMountWorkspace).not.toHaveBeenCalled();
    await manager.teardown();
  });

  it('falls through to create when getResumeAgentId returns null', async () => {
    const agentDb = {
      getLastChatWorkspacePaths: vi.fn(async () => []),
    };
    const createAgentSpy = vi
      .spyOn(AgentManager.prototype, 'createAgent')
      .mockResolvedValue({ instanceId: 'fresh' } as any);
    const resumeAgentSpy = vi
      .spyOn(AgentManager.prototype, 'resumeAgent')
      .mockResolvedValue({ instanceId: 'never' } as any);

    const deps = createDeps();
    const manager = new AgentManager({
      host: deps.host,
      commandRegistry: deps.registry,
      agentTypeRegistry: deps.agentTypeRegistry,
      startupPolicy: {
        kind: 'auto-create-default',
        agentType: AgentTypes.CHAT,
        mountLastWorkspaces: true,
        getResumeAgentId: () => null,
      },
      state: { store: deps.agentStore as any },
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
      if (createAgentSpy.mock.calls.length === 1) break;
    }
    expect(resumeAgentSpy).not.toHaveBeenCalled();
    expect(createAgentSpy).toHaveBeenCalledWith(AgentTypes.CHAT, undefined);
    await manager.teardown();
  });

  it('falls through to create when resume fails', async () => {
    const agentDb = {
      getLastChatWorkspacePaths: vi.fn(async () => []),
    };
    const createAgentSpy = vi
      .spyOn(AgentManager.prototype, 'createAgent')
      .mockResolvedValue({ instanceId: 'fresh' } as any);
    const resumeAgentSpy = vi
      .spyOn(AgentManager.prototype, 'resumeAgent')
      .mockRejectedValue(new Error('agent gone'));

    const deps = createDeps();
    const manager = new AgentManager({
      host: deps.host,
      commandRegistry: deps.registry,
      agentTypeRegistry: deps.agentTypeRegistry,
      startupPolicy: {
        kind: 'auto-create-default',
        agentType: AgentTypes.CHAT,
        mountLastWorkspaces: true,
        getResumeAgentId: () => 'dangling-id',
      },
      state: { store: deps.agentStore as any },
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
      if (createAgentSpy.mock.calls.length === 1) break;
    }
    expect(resumeAgentSpy).toHaveBeenCalledWith('dangling-id');
    expect(createAgentSpy).toHaveBeenCalledWith(AgentTypes.CHAT, undefined);
    await manager.teardown();
  });

  it('falls through to create when getResumeAgentId itself throws', async () => {
    const agentDb = {
      getLastChatWorkspacePaths: vi.fn(async () => []),
    };
    const createAgentSpy = vi
      .spyOn(AgentManager.prototype, 'createAgent')
      .mockResolvedValue({ instanceId: 'fresh' } as any);
    const resumeAgentSpy = vi
      .spyOn(AgentManager.prototype, 'resumeAgent')
      .mockResolvedValue({ instanceId: 'never' } as any);

    const deps = createDeps();
    const manager = new AgentManager({
      host: deps.host,
      commandRegistry: deps.registry,
      agentTypeRegistry: deps.agentTypeRegistry,
      startupPolicy: {
        kind: 'auto-create-default',
        agentType: AgentTypes.CHAT,
        mountLastWorkspaces: true,
        getResumeAgentId: () => {
          throw new Error('persisted state corrupted');
        },
      },
      state: { store: deps.agentStore as any },
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
      if (createAgentSpy.mock.calls.length === 1) break;
    }
    expect(resumeAgentSpy).not.toHaveBeenCalled();
    expect(createAgentSpy).toHaveBeenCalledWith(AgentTypes.CHAT, undefined);
    await manager.teardown();
  });
});
