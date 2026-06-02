import { describe, expect, it, vi } from 'vitest';
import { createTestAgentHost } from '../../host/test-utils';
import { ChatAgent } from './chat';

/**
 * Tests for {@link ChatAgent}'s tool-resolution contract.
 *
 * `ChatAgent` is the host-agnostic baseline: it must only request the
 * universal file-ops + `updateWorkspaceMd` spawn tool from its toolbox.
 * Host-specific tools (browser, shell, sandbox, ...) arrive via the
 * `getAdditionalTools` template hook, which subclasses override.
 *
 * We bypass `BaseAgent`'s heavy constructor here by stubbing the few
 * fields `getTools` actually touches (`instanceId`, `toolbox`,
 * `getSpawnChildAgentTool`). This keeps the test focused on the
 * contract without re-instantiating the whole agent runtime.
 */

interface ChatAgentInternals {
  instanceId: string;
  toolbox: { getTool: ReturnType<typeof vi.fn> };
  host: { workspaceMdRelativePath: () => string };
  getSpawnChildAgentTool: () => unknown;
  getTools: () => Promise<Record<string, unknown>>;
  getAdditionalTools: () => Promise<Record<string, unknown>>;
}

function makeStubAgent<T extends ChatAgent>(
  ctor: new (...args: never[]) => T,
  toolboxImpl: { getTool: ReturnType<typeof vi.fn> },
): ChatAgentInternals {
  const instance = Object.create(ctor.prototype) as ChatAgentInternals;
  instance.instanceId = 'test-agent';
  instance.toolbox = toolboxImpl;
  // Use a default-configured AgentHost so the tool-description path
  // reads `workspaceMdRelativePath()` without ceremony.
  instance.host = createTestAgentHost();
  instance.getSpawnChildAgentTool = () => ({ kind: 'spawn-child' });
  return instance;
}

describe('ChatAgent', () => {
  it('getAdditionalTools defaults to an empty record', async () => {
    const stub = makeStubAgent(ChatAgent, {
      getTool: vi.fn().mockResolvedValue({}),
    });
    const extra = await stub.getAdditionalTools();
    expect(extra).toEqual({});
  });

  it('getTools returns only universal file ops + updateWorkspaceMd', async () => {
    const getTool = vi.fn().mockResolvedValue({});
    const stub = makeStubAgent(ChatAgent, { getTool });
    const tools = await stub.getTools();

    expect(Object.keys(tools).sort()).toEqual([
      'copy',
      'delete',
      'glob',
      'grepSearch',
      'multiEdit',
      'read',
      'updateWorkspaceMd',
      'write',
    ]);
  });

  it('getTools never requests host-specific tools from the toolbox', async () => {
    const getTool = vi.fn().mockResolvedValue({});
    const stub = makeStubAgent(ChatAgent, { getTool });
    await stub.getTools();

    const requestedNames = getTool.mock.calls.map(([name]) => name);
    expect(requestedNames).not.toContain('executeSandboxJs');
    expect(requestedNames).not.toContain('executeShellCommand');
    expect(requestedNames).not.toContain('listLibraryDocs');
    expect(requestedNames).not.toContain('searchInLibraryDocs');
    expect(requestedNames).not.toContain('getLintingDiagnostics');
    expect(requestedNames).not.toContain('readConsoleLogs');
    expect(requestedNames).not.toContain('askUserQuestions');
  });

  it('getTools filters out null entries returned by the toolbox', async () => {
    const getTool = vi
      .fn()
      .mockImplementation(async (name: string) =>
        name === 'delete' || name === 'copy' ? null : {},
      );
    const stub = makeStubAgent(ChatAgent, { getTool });
    const tools = await stub.getTools();

    expect(tools).not.toHaveProperty('delete');
    expect(tools).not.toHaveProperty('copy');
    expect(tools).toHaveProperty('read');
    expect(tools).toHaveProperty('write');
    expect(tools).toHaveProperty('updateWorkspaceMd');
  });

  it('subclass overrides of getAdditionalTools are merged into getTools', async () => {
    class SubChatAgent extends ChatAgent {
      protected async getAdditionalTools(): Promise<Record<string, unknown>> {
        return {
          customHostTool: { kind: 'host-tool' },
        } as Record<string, never>;
      }
    }
    const getTool = vi.fn().mockResolvedValue({});
    const stub = makeStubAgent(SubChatAgent, { getTool });
    const tools = await stub.getTools();

    expect(tools).toHaveProperty('customHostTool');
    expect(tools.read).toBeDefined();
  });

  it('subclass-provided null entries are filtered out alongside baseline nulls', async () => {
    class SubChatAgent extends ChatAgent {
      protected async getAdditionalTools(): Promise<Record<string, unknown>> {
        return {
          missingHostTool: null,
          presentHostTool: { kind: 'host-tool' },
        } as Record<string, never>;
      }
    }
    const getTool = vi.fn().mockResolvedValue({});
    const stub = makeStubAgent(SubChatAgent, { getTool });
    const tools = await stub.getTools();

    expect(tools).not.toHaveProperty('missingHostTool');
    expect(tools).toHaveProperty('presentHostTool');
  });
});
