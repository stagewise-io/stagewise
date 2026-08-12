import type {
  CreateElicitationRequest,
  CreateElicitationResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionConfigOption,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import type {
  ExternalAgentRuntimeContext,
  ExternalAgentRuntime,
  UtilityModelEntry,
} from '@stagewise/agent-core/host';
import type { AgentMessage } from '@stagewise/agent-core/types';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import nodePath from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@/services/logger';
import type { AcpAdapter } from './adapter';
import { ACP_ADAPTERS } from './adapter-registry';
import { AcpAgentRuntime } from './runtime';
import type { ToolState } from './tool-mapper';

type RuntimeInternals = {
  stopped: boolean;
  approvalMode: string;
  adapter: AcpAdapter;
  sessionId: string;
  activePrompt: Promise<unknown> | null;
  permissionRejected: boolean;
  client: {
    cancel(sessionId: string): Promise<void>;
    close(): void;
    isRunning?(): boolean;
    getNodeExecutable?(): string;
    prompt?(input?: unknown): Promise<unknown>;
    setConfigOption(input: {
      sessionId: string;
      configId: string;
      value: string;
    }): Promise<{ configOptions: SessionConfigOption[] }>;
  } | null;
  processKey: string | null;
  ensureSession(
    adapter: AcpAdapter,
    cwd: string,
    roots: string[],
  ): Promise<boolean>;
  stagewiseMcp: {
    start(nodeExecutable: string): Promise<unknown>;
  };
  assistantMessage: AgentMessage & { role: 'assistant' };
  handleElicitation(
    request: CreateElicitationRequest,
  ): Promise<CreateElicitationResponse>;
  handleStagewiseToolRequest(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<unknown>;
  handlePermission(
    request: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse>;
  applySessionOptions(
    selection: UtilityModelEntry,
    options: SessionConfigOption[],
  ): Promise<void>;
  handleSessionUpdate(notification: SessionNotification): void;
  upsertTool(tool: ToolState): void;
  promptUntilSettled(
    prompt: Array<{ type: 'text'; text: string }>,
    generation: number,
  ): Promise<void>;
  closeClient(): void;
  stop(approvalDenyReason?: string): Promise<void>;
};

const permissionOptions: RequestPermissionRequest['options'] = [
  { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
  { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
];

function commandPermissionRequest(
  title: string,
  command: string,
): RequestPermissionRequest {
  return {
    sessionId: 'session-1',
    toolCall: {
      toolCallId: 'command-1',
      title,
      kind: 'execute',
      status: 'pending',
      rawInput: { command },
    },
    options: permissionOptions,
  };
}

function createRuntime(
  requestUserInput = vi.fn(),
  writeAttachment = vi.fn().mockResolvedValue(undefined),
  classifyCommand = vi.fn(),
  providerTypeForInstance: (
    providerInstanceId?: string,
  ) => 'codex' | 'stagewise' = () => 'codex',
  agentDirectory = '/agent',
  recordApprovalExplanation = vi.fn(),
) {
  const messages: Array<AgentMessage & { role: 'assistant' }> = [];
  const context = {
    instanceId: 'agent-1',
    getState: vi.fn(),
    upsertAssistantMessage: vi.fn((message) => messages.push(message)),
    recordUsage: vi.fn(),
    getMountedPaths: () => new Map([['workspace', '/repo']]),
    writeAttachment,
    requestUserInput,
    cancelUserInput: vi.fn(),
    notifyApprovalRequested: vi.fn(),
  } as unknown as ExternalAgentRuntimeContext;
  const runtime = new AcpAgentRuntime(
    context,
    { debug: vi.fn(), warn: vi.fn() } as unknown as Logger,
    providerTypeForInstance,
    () => undefined,
    agentDirectory,
    () => Promise.resolve({}),
    '/stagewise-mcp-server.mjs',
    classifyCommand,
    recordApprovalExplanation,
  );
  Object.assign(runtime, {
    stopped: false,
    adapter: ACP_ADAPTERS.codex,
    assistantMessage: { id: 'assistant-1', role: 'assistant', parts: [] },
  });
  return {
    runtime: runtime as unknown as RuntimeInternals & ExternalAgentRuntime,
    messages,
    context,
    writeAttachment,
    recordApprovalExplanation,
  };
}

describe('AcpAgentRuntime translation', () => {
  it('discards a failed ACP process before retrying', async () => {
    const { runtime } = createRuntime();
    const close = vi.fn();
    Object.assign(runtime, {
      client: {
        close,
        isRunning: () => true,
        getNodeExecutable: () => process.execPath,
        prompt: vi.fn().mockRejectedValue(new Error('Authentication required')),
      },
      processKey: 'codex:default',
      sessionId: 'session-1',
      stagewiseMcp: {
        start: vi.fn().mockResolvedValue({}),
      },
    });

    await expect(
      runtime.runTurn({
        selection: { modelId: 'default', providerInstanceId: 'provider-1' },
        userMessages: [],
        approvalMode: 'smart',
      }),
    ).rejects.toThrow('Authentication required');

    expect(close).toHaveBeenCalledOnce();
    expect(runtime.client).toBeNull();
  });

  it('re-seeds ACP history after a native-agent turn', async () => {
    const { runtime, context } = createRuntime(
      vi.fn(),
      vi.fn().mockResolvedValue(undefined),
      vi.fn(),
      (instanceId) => (instanceId === 'native' ? 'stagewise' : 'codex'),
    );
    const currentMessage = {
      id: 'current-user',
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'Continue externally' }],
    };
    vi.mocked(context.getState).mockReturnValue({
      history: [
        {
          id: 'native-assistant',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Native provider result' }],
        },
        currentMessage,
      ],
    } as ReturnType<typeof context.getState>);
    const close = vi.fn();
    const promptUntilSettled = vi.fn().mockResolvedValue(undefined);
    Object.assign(runtime, {
      client: { close },
      sessionId: 'old-session',
      processKey: 'codex:default',
      ensureSession: vi.fn().mockResolvedValue(true),
      applySessionOptions: vi.fn().mockResolvedValue(undefined),
      promptUntilSettled,
    });

    expect(
      runtime.handles({ modelId: 'native', providerInstanceId: 'native' }),
    ).toBe(false);
    await runtime.runTurn({
      selection: { modelId: 'codex', providerInstanceId: 'external' },
      userMessages: [currentMessage],
      approvalMode: 'smart',
    });

    expect(close).toHaveBeenCalledOnce();
    const prompt = promptUntilSettled.mock.calls[0]?.[0] as Array<{
      type: string;
      text?: string;
    }>;
    expect(prompt.map((part) => part.text ?? '').join('\n')).toContain(
      'Native provider result',
    );
  });

  it('invalidates a persisted ACP session after a native-agent turn', () => {
    const agentDirectory = mkdtempSync(
      nodePath.join(tmpdir(), 'stagewise-acp-'),
    );
    const sessionFile = nodePath.join(agentDirectory, 'acp-session.json');
    try {
      writeFileSync(sessionFile, '{}');
      const { runtime } = createRuntime(
        vi.fn(),
        vi.fn().mockResolvedValue(undefined),
        vi.fn(),
        (instanceId) => (instanceId === 'native' ? 'stagewise' : 'codex'),
        agentDirectory,
      );

      expect(
        runtime.handles({ modelId: 'native', providerInstanceId: 'native' }),
      ).toBe(false);
      expect(existsSync(sessionFile)).toBe(false);
    } finally {
      rmSync(agentDirectory, { recursive: true, force: true });
    }
  });

  it('renders Codex image generation as a native image', async () => {
    const { runtime, messages, writeAttachment } = createRuntime();
    runtime.upsertTool({
      toolCallId: 'image-1',
      title: 'Image generation',
      kind: 'other',
      status: 'completed',
      content: [
        {
          type: 'content',
          content: {
            type: 'image',
            data: Buffer.from('generated image').toString('base64'),
            mimeType: 'image/png',
          },
        },
      ],
    });

    await vi.waitFor(() => expect(writeAttachment).toHaveBeenCalledOnce());
    const filename = writeAttachment.mock.calls[0]?.[0] as string;
    expect(filename).toMatch(/^generated_[a-f0-9]{16}\.png$/);
    expect(writeAttachment.mock.calls[0]?.[1]).toEqual(
      Buffer.from('generated image'),
    );
    expect(messages.at(-1)?.parts).toMatchObject([
      {
        type: 'file',
        mediaType: 'image/png',
        filename,
        url: `attachment://agent-1/${filename}`,
      },
    ]);
  });

  it('renders every file in a multi-file ACP diff', () => {
    const { runtime, messages } = createRuntime();

    runtime.upsertTool({
      toolCallId: 'edit-1',
      title: 'Edit files',
      kind: 'edit',
      status: 'in_progress',
    });
    expect(messages).toEqual([]);

    runtime.upsertTool({
      toolCallId: 'edit-1',
      title: 'Edit files',
      kind: 'edit',
      status: 'completed',
      content: [
        {
          type: 'diff',
          path: '/repo/src/a.ts',
          oldText: 'one',
          newText: 'two',
        },
        {
          type: 'diff',
          path: '/repo/src/b.ts',
          newText: 'new',
        },
      ],
    });

    expect(messages.at(-1)?.parts).toMatchObject([
      {
        type: 'tool-multiEdit',
        input: { path: 'workspace/src/a.ts' },
      },
      {
        type: 'tool-write',
        input: { path: 'workspace/src/b.ts' },
      },
    ]);
  });

  it('uses structured command output and preserves the real exit code', () => {
    const { runtime, messages } = createRuntime();

    runtime.upsertTool({
      toolCallId: 'command-1',
      title: 'Exit seven',
      kind: 'execute',
      status: 'failed',
      rawInput: { command: 'exit 7' },
      rawOutput: {
        formatted_output: 'EXPECTED_FAILURE\n',
        exit_code: 7,
      },
    });

    expect(messages.at(-1)?.parts[0]).toMatchObject({
      type: 'tool-executeShellCommand',
      output: {
        output: 'EXPECTED_FAILURE\n',
        exit_code: 7,
      },
      errorText: 'EXPECTED_FAILURE\n',
    });
  });

  it('merges ACP terminal output and exit metadata', () => {
    const { runtime, messages } = createRuntime();

    runtime.upsertTool({
      toolCallId: 'command-1',
      title: 'Exit seven',
      kind: 'execute',
      status: 'in_progress',
      rawInput: { command: 'exit 7' },
      _meta: {
        terminal_output: { terminal_id: 'terminal-1', data: 'FAILED\n' },
      },
    });
    runtime.upsertTool({
      toolCallId: 'command-1',
      title: 'Exit seven',
      kind: 'execute',
      status: 'in_progress',
      _meta: {
        terminal_exit: { terminal_id: 'terminal-1', exit_code: 7 },
      },
    });

    expect(messages.at(-1)?.parts[0]).toMatchObject({
      type: 'tool-executeShellCommand',
      state: 'output-error',
      output: { output: 'FAILED\n', exit_code: 7 },
      errorText: 'FAILED\n',
    });
  });

  it('maps ACP list and search operations to native Stagewise tools', () => {
    const { runtime, messages } = createRuntime();

    runtime.upsertTool({
      toolCallId: 'list-1',
      title: "List files in 'src'",
      kind: 'read',
      status: 'completed',
      rawOutput: { formatted_output: 'src/a.ts\nsrc/b.ts\n', exit_code: 0 },
    });
    runtime.upsertTool({
      toolCallId: 'search-1',
      title: "Search for 'needle' in workspace",
      kind: 'search',
      status: 'completed',
      rawOutput: {
        formatted_output: 'src/a.ts:1:needle\nsrc/b.ts:2:needle\n',
        exit_code: 0,
      },
    });

    expect(messages.at(-1)?.parts).toMatchObject([
      {
        type: 'tool-ls',
        input: { path: 'workspace/src' },
      },
      {
        type: 'tool-grepSearch',
        input: { mount_prefix: 'workspace', query: 'needle' },
        output: { result: { totalMatches: 2 } },
      },
    ]);
  });

  it('normalizes OpenCode todo tools into the shared plan UI', () => {
    const { runtime, messages } = createRuntime();
    runtime.adapter = ACP_ADAPTERS.opencode;

    runtime.upsertTool({
      toolCallId: 'todo-1',
      title: 'Update todos',
      kind: 'other',
      status: 'completed',
      rawInput: {
        todos: [
          { content: 'Inspect workspace', status: 'completed' },
          { content: 'Run tests', status: 'in_progress' },
        ],
      },
    });

    expect(messages.at(-1)?.parts).toMatchObject([
      {
        type: 'dynamic-tool',
        toolName: 'acp.plan',
        input: {
          plan: [
            { step: 'Inspect workspace', status: 'completed' },
            { step: 'Run tests', status: 'inProgress' },
          ],
        },
      },
    ]);
  });

  it('summarizes edits without standardized ACP diffs', () => {
    const { runtime, messages } = createRuntime();

    runtime.upsertTool({
      toolCallId: 'edit-summary',
      title: 'Edit files',
      kind: 'edit',
      status: 'completed',
      locations: [{ path: '/repo/src/a.ts' }, { path: '/repo/src/b.ts' }],
      rawInput: { patchText: 'provider-specific patch data' },
    });

    expect(messages.at(-1)?.parts[0]).toMatchObject({
      type: 'dynamic-tool',
      toolName: 'acp.edit',
      input: {
        title: 'Edit files',
        kind: 'edit',
        locations: ['workspace/src/a.ts', 'workspace/src/b.ts'],
      },
      output: { status: 'completed' },
    });
    expect(messages.at(-1)?.parts[0]).not.toHaveProperty('input.patchText');
  });

  it('normalizes OpenCode apply_patch metadata and renders deletes', () => {
    const { runtime, messages } = createRuntime();
    const tool = ACP_ADAPTERS.opencode.normalizeTool!({
      toolCallId: 'patch-1',
      title: 'Success. Updated the following files',
      kind: 'edit',
      status: 'completed',
      rawOutput: {
        metadata: {
          files: [
            {
              filePath: '/repo/src/b.ts',
              type: 'update',
              patch:
                '--- /repo/src/b.ts\n+++ /repo/src/b.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n context\n@@ -10 +10 @@\n-old two\n+new two\n',
            },
            {
              filePath: '/repo/src/old.ts',
              type: 'delete',
              patch:
                '--- /repo/src/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n',
            },
          ],
        },
      },
    });

    expect(tool?.content).toEqual([
      {
        type: 'diff',
        path: '/repo/src/b.ts',
        oldText: 'old\ncontext\n',
        newText: 'new\ncontext\n',
      },
      {
        type: 'diff',
        path: '/repo/src/b.ts',
        oldText: 'old two\n',
        newText: 'new two\n',
      },
      {
        type: 'diff',
        path: '/repo/src/old.ts',
        oldText: 'old\n',
        newText: '',
        _meta: { stagewiseOperation: 'delete' },
      },
    ]);
    runtime.upsertTool(tool);
    expect(messages.at(-1)?.parts[2]).toMatchObject({
      type: 'tool-delete',
      input: { path: 'workspace/src/old.ts' },
      output: { _diff: { before: 'old\n', after: null } },
    });
  });

  it('shows MCP questions natively and hides their technical tool call', async () => {
    const requestUserInput = vi.fn().mockResolvedValue({
      completed: true,
      cancelled: false,
      completedSteps: 1,
      answers: { mode: 'full' },
    });
    const { runtime, messages } = createRuntime(requestUserInput);
    const input = {
      title: 'Smoke test',
      steps: [
        {
          fields: [
            {
              type: 'radio-group',
              questionId: 'mode',
              label: 'Mode',
              options: [{ value: 'full', label: 'Full' }],
            },
          ],
        },
      ],
    };

    await runtime.handleStagewiseToolRequest(input);
    runtime.upsertTool({
      toolCallId: 'mcp-1',
      name: 'mcp.stagewise.stagewise_request_user_input',
      title: 'Ask the user',
      kind: 'execute',
      status: 'completed',
      rawInput: {
        server: 'stagewise',
        tool: 'stagewise_request_user_input',
        arguments: input,
      },
    });

    expect(requestUserInput).toHaveBeenCalledWith(input);
    expect(messages.at(-1)?.parts).toHaveLength(1);
    expect(messages.at(-1)?.parts[0]).toMatchObject({
      type: 'tool-askUserQuestions',
      state: 'output-available',
      output: { answers: { mode: 'full' } },
    });
  });

  it('hides OpenCode MCP question calls identified only by their title', () => {
    const { runtime, messages } = createRuntime();
    runtime.adapter = ACP_ADAPTERS.opencode;

    runtime.upsertTool({
      toolCallId: 'question-1',
      title: 'stagewise_stagewise_request_user_input',
      kind: 'other',
      status: 'completed',
      rawOutput: { completed: true },
    });

    expect(messages.at(-1)?.parts ?? []).toEqual([]);
  });

  it('recognizes a Claude MCP question from its earlier tool metadata', async () => {
    const { runtime, messages } = createRuntime();
    runtime.sessionId = 'session-1';
    runtime.upsertTool({
      toolCallId: 'question-1',
      title: 'stagewise_request_user_input',
      kind: 'other',
      status: 'pending',
      rawInput: { questions: [] },
      _meta: {
        claudeCode: {
          toolName: 'mcp__stagewise__stagewise_request_user_input',
        },
      },
    });

    const response = await runtime.handlePermission({
      sessionId: 'session-1',
      toolCall: {
        toolCallId: 'question-1',
        title: 'stagewise_request_user_input',
        kind: 'other',
        status: 'pending',
        rawInput: { questions: [] },
      },
      options: permissionOptions,
    });

    expect(response).toEqual({
      outcome: { outcome: 'selected', optionId: 'allow' },
    });
    expect(messages).toEqual([]);
  });

  it('auto-approves Claude file edits inside the mounted workspace', async () => {
    const { runtime, messages } = createRuntime();
    runtime.sessionId = 'session-1';
    runtime.upsertTool({
      toolCallId: 'write-1',
      title: 'Write src/a.ts',
      kind: 'edit',
      status: 'pending',
      locations: [{ path: '/repo/src/a.ts' }],
      content: [
        {
          type: 'diff',
          path: '/repo/src/a.ts',
          oldText: null,
          newText: 'export const value = 1;\n',
        },
      ],
      _meta: { claudeCode: { toolName: 'Write' } },
    });

    const response = await runtime.handlePermission({
      sessionId: 'session-1',
      toolCall: {
        toolCallId: 'write-1',
        title: 'Write src/a.ts',
        kind: 'edit',
        status: 'pending',
        locations: [{ path: '/repo/src/a.ts' }],
      },
      options: permissionOptions,
    });

    expect(response).toEqual({
      outcome: { outcome: 'selected', optionId: 'allow' },
    });
    expect(messages.at(-1)?.parts[0]).toMatchObject({
      type: 'tool-write',
      state: 'input-available',
    });
  });

  it('auto-approves workspace diffs when ACP omits locations', async () => {
    const { runtime, messages } = createRuntime();
    runtime.sessionId = 'session-1';

    await expect(
      runtime.handlePermission({
        sessionId: 'session-1',
        toolCall: {
          toolCallId: 'write-1',
          title: 'Write src/a.ts',
          kind: 'edit',
          status: 'pending',
          content: [
            {
              type: 'diff',
              path: '/repo/src/a.ts',
              newText: 'export const value = 1;\n',
            },
          ],
        },
        options: permissionOptions,
      }),
    ).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'allow' },
    });
    expect(messages).toEqual([]);
  });

  it('hides Claude internal plan files', () => {
    const { runtime, messages } = createRuntime();
    runtime.adapter = ACP_ADAPTERS['claude-code'];
    const planPath = `${homedir()}/.claude/plans/test.md`;

    runtime.upsertTool({
      toolCallId: 'plan-write',
      title: 'Write plan',
      kind: 'edit',
      status: 'completed',
      locations: [{ path: planPath }],
      content: [
        {
          type: 'diff',
          path: planPath,
          newText: '# Internal plan',
        },
      ],
    });

    expect(messages.at(-1)?.parts ?? []).toEqual([]);
  });

  it('still asks before a file edit outside mounted workspaces', async () => {
    const { runtime, messages, context } = createRuntime();
    runtime.sessionId = 'session-1';
    const request: RequestPermissionRequest = {
      sessionId: 'session-1',
      toolCall: {
        toolCallId: 'write-1',
        title: 'Write outside.txt',
        kind: 'edit',
        status: 'pending',
        locations: [{ path: '/outside.txt' }],
        content: [
          {
            type: 'diff',
            path: '/outside-a.txt',
            newText: 'a',
          },
          {
            type: 'diff',
            path: '/outside-b.txt',
            newText: 'b',
          },
        ],
      },
      options: permissionOptions,
    };

    const permission = runtime.handlePermission(request);
    expect(messages.at(-1)?.parts[0]).toMatchObject({
      state: 'approval-requested',
      approval: { id: 'write-1' },
    });
    expect(context.notifyApprovalRequested).toHaveBeenCalledWith(
      'write-1',
      'edit',
    );
    await runtime.respondToApproval({
      type: 'tool-approval-response',
      approvalId: 'write-1',
      approved: false,
    });
    expect(messages.at(-1)?.parts).toMatchObject([
      { state: 'approval-responded' },
      { state: 'approval-responded' },
    ]);
    await expect(permission).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'reject' },
    });
  });

  it('keeps an approval visible when a pending tool update arrives', async () => {
    const { runtime, messages } = createRuntime();
    runtime.sessionId = 'session-1';
    runtime.approvalMode = 'alwaysAsk';
    const request: RequestPermissionRequest = {
      sessionId: 'session-1',
      toolCall: {
        toolCallId: 'command-1',
        title: 'Create directory',
        kind: 'execute',
        status: 'pending',
        rawInput: { command: 'mkdir test' },
      },
      options: permissionOptions,
    };

    const permission = runtime.handlePermission(request);
    runtime.upsertTool({
      toolCallId: 'command-1',
      title: 'Create directory',
      kind: 'execute',
      status: 'in_progress',
      rawInput: { command: 'mkdir test' },
    });

    expect(messages.at(-1)?.parts[0]).toMatchObject({
      type: 'tool-executeShellCommand',
      state: 'approval-requested',
      approval: { id: 'command-1' },
    });
    await runtime.respondToApproval({
      type: 'tool-approval-response',
      approvalId: 'command-1',
      approved: false,
    });
    await expect(permission).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'reject' },
    });
  });

  it('cancels pending approvals when the ACP client closes', async () => {
    const { runtime, messages } = createRuntime();
    runtime.sessionId = 'session-1';
    runtime.approvalMode = 'alwaysAsk';
    const permission = runtime.handlePermission({
      sessionId: 'session-1',
      toolCall: {
        toolCallId: 'command-1',
        title: 'Create directory',
        kind: 'execute',
        status: 'pending',
      },
      options: permissionOptions,
    });

    runtime.closeClient();

    await expect(permission).resolves.toEqual({
      outcome: { outcome: 'cancelled' },
    });
    expect(messages.at(-1)?.parts[0]).toMatchObject({
      state: 'output-denied',
      approval: { approved: false },
    });
  });

  it('keeps the host reason when stopping a pending approval', async () => {
    const { runtime, messages } = createRuntime();
    runtime.sessionId = 'session-1';
    runtime.approvalMode = 'alwaysAsk';
    const permission = runtime.handlePermission(
      commandPermissionRequest('Create directory', 'mkdir test'),
    );

    await runtime.stop('Stopped by the user.');

    await expect(permission).resolves.toEqual({
      outcome: { outcome: 'cancelled' },
    });
    expect(messages.at(-1)?.parts[0]).toMatchObject({
      state: 'output-denied',
      approval: { approved: false, reason: 'Stopped by the user.' },
    });
  });

  it('hides and auto-approves Claude bookkeeping tools', async () => {
    const { runtime, messages } = createRuntime();
    runtime.adapter = ACP_ADAPTERS['claude-code'];
    runtime.sessionId = 'session-1';

    for (const name of ['ToolSearch', 'EnterPlanMode', 'ExitPlanMode']) {
      runtime.upsertTool({
        toolCallId: name,
        title: name,
        kind: 'other',
        status: 'completed',
        _meta: { claudeCode: { toolName: name } },
      });
    }

    await expect(
      runtime.handlePermission({
        sessionId: 'session-1',
        toolCall: {
          toolCallId: 'exit-plan',
          title: 'ExitPlanMode',
          kind: 'other',
          status: 'pending',
          _meta: { claudeCode: { toolName: 'ExitPlanMode' } },
        },
        options: permissionOptions,
      }),
    ).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'allow' },
    });

    expect(messages).toEqual([]);
  });

  it('translates native ACP elicitation into the Stagewise question UI', async () => {
    const requestUserInput = vi.fn().mockResolvedValue({
      completed: true,
      cancelled: false,
      answers: { mode: 'Full', notes: 'ready' },
    });
    const { runtime, messages } = createRuntime(requestUserInput);
    runtime.sessionId = 'session-1';

    const response = await runtime.handleElicitation({
      sessionId: 'session-1',
      toolCallId: 'question-1',
      mode: 'form',
      message: 'Choose a test mode',
      requestedSchema: {
        type: 'object',
        title: 'Smoke test',
        required: ['mode'],
        properties: {
          mode: {
            type: 'string',
            title: 'Mode',
            oneOf: [
              { const: 'Full', title: 'Full' },
              { const: 'Quick', title: 'Quick' },
            ],
          },
          notes: { type: 'string', title: 'Notes' },
        },
      },
    });

    expect(requestUserInput).toHaveBeenCalledWith({
      title: 'Smoke test',
      description: 'Choose a test mode',
      steps: [
        {
          fields: [
            expect.objectContaining({
              type: 'radio-group',
              questionId: 'mode',
              required: true,
            }),
            expect.objectContaining({
              type: 'input',
              questionId: 'notes',
            }),
          ],
        },
      ],
    });
    expect(response).toEqual({
      action: 'accept',
      content: { mode: 'Full', notes: 'ready' },
    });
    expect(messages.at(-1)?.parts[0]).toMatchObject({
      type: 'tool-askUserQuestions',
      toolCallId: 'question-1',
      state: 'output-available',
    });
  });

  it('cancels stale and oversized ACP forms without opening the UI', async () => {
    const requestUserInput = vi.fn();
    const { runtime } = createRuntime(requestUserInput);
    runtime.sessionId = 'session-1';

    await expect(
      runtime.handleElicitation({
        sessionId: 'stale-session',
        toolCallId: 'stale-question',
        mode: 'form',
        message: 'Stale',
        requestedSchema: { type: 'object', properties: {} },
      }),
    ).resolves.toEqual({ action: 'cancel' });

    await expect(
      runtime.handleElicitation({
        sessionId: 'session-1',
        toolCallId: 'large-question',
        mode: 'form',
        message: 'Too large',
        requestedSchema: {
          type: 'object',
          properties: Object.fromEntries(
            Array.from({ length: 51 }, (_, index) => [
              `field-${index}`,
              { type: 'string' },
            ]),
          ),
        },
      }),
    ).resolves.toEqual({ action: 'cancel' });
    expect(requestUserInput).not.toHaveBeenCalled();
  });

  it('closes a pending Stagewise form when its MCP request is aborted', async () => {
    const requestUserInput = vi.fn(() => new Promise(() => {}));
    const { runtime, messages, context } = createRuntime(requestUserInput);
    const controller = new AbortController();
    const pending = runtime.handleStagewiseToolRequest(
      { title: 'Question', steps: [{ fields: [] }] },
      controller.signal,
    );

    controller.abort();

    await expect(pending).resolves.toMatchObject({
      completed: false,
      cancelled: true,
    });
    expect(messages.at(-1)?.parts[0]).toMatchObject({
      type: 'tool-askUserQuestions',
      state: 'output-available',
      output: { cancelled: true },
    });
    expect(context.cancelUserInput).toHaveBeenCalledOnce();
  });

  it('rejects concurrent Stagewise forms without closing the active one', async () => {
    const requestUserInput = vi.fn(() => new Promise(() => {}));
    const { runtime, context } = createRuntime(requestUserInput);
    const controller = new AbortController();
    const active = runtime.handleStagewiseToolRequest(
      { title: 'Active', steps: [{ fields: [] }] },
      controller.signal,
    );

    await expect(
      runtime.handleStagewiseToolRequest({
        title: 'Concurrent',
        steps: [{ fields: [] }],
      }),
    ).resolves.toMatchObject({ completed: false, cancelled: true });
    expect(context.cancelUserInput).not.toHaveBeenCalled();

    controller.abort();
    await active;
  });

  it('uses Stagewise smart approval for ACP shell commands', async () => {
    const classifyCommand = vi.fn().mockResolvedValue({
      needsApproval: false,
      explanation: 'Read-only command inside the workspace.',
    });
    const { runtime, messages } = createRuntime(
      vi.fn(),
      vi.fn().mockResolvedValue(undefined),
      classifyCommand,
    );
    runtime.sessionId = 'session-1';
    runtime.approvalMode = 'smart';

    await expect(
      runtime.handlePermission(
        commandPermissionRequest('Inspect status', 'git status --short'),
      ),
    ).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'allow' },
    });
    expect(classifyCommand).toHaveBeenCalledWith({
      toolCallId: 'command-1',
      command: 'git status --short',
      cwdPrefix: 'workspace',
      agentExplanation: 'Inspect status',
    });
    expect(messages).toEqual([]);
  });

  it('records why a smart-approved command needs confirmation', async () => {
    const classifyCommand = vi.fn().mockResolvedValue({
      needsApproval: true,
      explanation: 'Publishes a package.',
    });
    const { runtime, recordApprovalExplanation } = createRuntime(
      vi.fn(),
      vi.fn().mockResolvedValue(undefined),
      classifyCommand,
    );
    runtime.sessionId = 'session-1';
    runtime.approvalMode = 'smart';

    const permission = runtime.handlePermission(
      commandPermissionRequest('Publish package', 'npm publish'),
    );
    await vi.waitFor(() => {
      expect(recordApprovalExplanation).toHaveBeenCalledWith(
        'command-1',
        'Publishes a package.',
      );
    });

    await runtime.stop();
    await expect(permission).resolves.toEqual({
      outcome: { outcome: 'cancelled' },
    });
  });

  it('discards smart approval results after the turn stops', async () => {
    let resolveClassification!: (value: {
      needsApproval: boolean;
      explanation: string;
    }) => void;
    const classifyCommand = vi.fn(
      () =>
        new Promise<{
          needsApproval: boolean;
          explanation: string;
        }>((resolve) => {
          resolveClassification = resolve;
        }),
    );
    const { runtime, context, recordApprovalExplanation } = createRuntime(
      vi.fn(),
      vi.fn().mockResolvedValue(undefined),
      classifyCommand,
    );
    runtime.sessionId = 'session-1';
    runtime.approvalMode = 'smart';

    const pending = runtime.handlePermission(
      commandPermissionRequest('Publish package', 'npm publish'),
    );
    await runtime.stop();
    resolveClassification({
      needsApproval: true,
      explanation: 'Publishes a package.',
    });

    await expect(pending).resolves.toEqual({
      outcome: { outcome: 'cancelled' },
    });
    expect(context.notifyApprovalRequested).not.toHaveBeenCalled();
    expect(recordApprovalExplanation).not.toHaveBeenCalled();
  });

  it('continues OpenCode after a rejected permission ends its prompt', async () => {
    const { runtime } = createRuntime();
    const prompt = vi.fn().mockImplementationOnce(async () => {
      runtime.permissionRejected = true;
    });
    runtime.adapter = ACP_ADAPTERS.opencode;
    runtime.sessionId = 'session-1';
    runtime.client = {
      cancel: vi.fn(),
      close: vi.fn(),
      prompt,
      setConfigOption: vi.fn(),
    };

    await runtime.promptUntilSettled([{ type: 'text', text: 'Start' }], 0);

    expect(prompt).toHaveBeenCalledTimes(2);
    expect(prompt.mock.calls[1]?.[0]).toMatchObject({
      prompt: [
        expect.objectContaining({
          text: expect.stringContaining('Continue from the rejected tool call'),
        }),
      ],
    });
  });

  it('keeps a turn active while an ACP command is still running', async () => {
    const { runtime } = createRuntime();
    runtime.adapter = ACP_ADAPTERS['claude-code'];
    runtime.sessionId = 'session-1';
    runtime.client = {
      cancel: vi.fn(),
      close: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      setConfigOption: vi.fn(),
    };
    runtime.upsertTool({
      toolCallId: 'command-1',
      title: 'Wait',
      kind: 'execute',
      status: 'in_progress',
    });

    let finished = false;
    const turn = runtime
      .promptUntilSettled([{ type: 'text', text: 'Start' }], 0)
      .then(() => {
        finished = true;
      });
    await Promise.resolve();
    expect(finished).toBe(false);

    runtime.upsertTool({
      toolCallId: 'command-1',
      title: 'Wait',
      kind: 'execute',
      status: 'completed',
    });
    await turn;
    expect(finished).toBe(true);
  });

  it('continues after a provider omits the final command status', async () => {
    vi.useFakeTimers();
    try {
      const { runtime } = createRuntime();
      const prompt = vi.fn().mockResolvedValue(undefined);
      runtime.adapter = ACP_ADAPTERS['claude-code'];
      runtime.sessionId = 'session-1';
      runtime.client = {
        cancel: vi.fn(),
        close: vi.fn(),
        prompt,
        setConfigOption: vi.fn(),
      };
      runtime.upsertTool({
        toolCallId: 'command-1',
        title: 'Exit seven',
        kind: 'execute',
        status: 'in_progress',
      });

      const turn = runtime.promptUntilSettled(
        [{ type: 'text', text: 'Start' }],
        0,
      );
      await vi.advanceTimersByTimeAsync(1_000);
      await turn;

      expect(prompt).toHaveBeenCalledTimes(2);
      expect(prompt.mock.calls[1]?.[0]).toMatchObject({
        prompt: [
          expect.objectContaining({
            text: expect.stringContaining(
              'ended without a final ACP status update',
            ),
          }),
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps Always ask to the Codex read-only approval mode', async () => {
    const { runtime } = createRuntime();
    const nextOptions: SessionConfigOption[] = [
      {
        id: 'mode',
        name: 'Mode',
        category: 'mode',
        type: 'select',
        currentValue: 'read-only',
        options: [
          { value: 'read-only', name: 'Read-only' },
          { value: 'agent', name: 'Agent' },
        ],
      },
      {
        id: 'reasoning_effort',
        name: 'Reasoning effort',
        type: 'select',
        currentValue: 'high',
        options: [
          { value: 'none', name: 'None' },
          { value: 'high', name: 'High' },
        ],
      },
    ];
    const setConfigOption = vi.fn().mockResolvedValue({
      configOptions: nextOptions,
    });
    runtime.sessionId = 'session-1';
    runtime.approvalMode = 'alwaysAsk';
    runtime.client = {
      cancel: vi.fn(),
      close: vi.fn(),
      setConfigOption,
    };

    await runtime.applySessionOptions(
      {
        modelId: 'model-1',
        thinkingOverride: { enabled: false, value: 'high' },
      },
      [
        {
          ...nextOptions[0],
          currentValue: 'agent',
        } as SessionConfigOption,
      ],
    );

    expect(setConfigOption).toHaveBeenNthCalledWith(1, {
      sessionId: 'session-1',
      configId: 'mode',
      value: 'read-only',
    });
    expect(setConfigOption).toHaveBeenNthCalledWith(2, {
      sessionId: 'session-1',
      configId: 'reasoning_effort',
      value: 'none',
    });
  });

  it('restarts an ACP process that ignores cancellation', async () => {
    vi.useFakeTimers();
    try {
      const { runtime } = createRuntime();
      const client = {
        cancel: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        setConfigOption: vi.fn(),
      };
      runtime.sessionId = 'session-1';
      runtime.client = client;
      runtime.activePrompt = new Promise(() => {});

      const stopping = runtime.stop();
      await vi.advanceTimersByTimeAsync(3_000);
      await stopping;

      expect(client.cancel).toHaveBeenCalledWith('session-1');
      expect(client.close).toHaveBeenCalledOnce();
      expect(runtime.client).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['OpenCode', ACP_ADAPTERS.opencode],
    ['Claude Code', ACP_ADAPTERS['claude-code']],
  ])('restarts %s after cancellation', async (_name, adapter) => {
    const { runtime } = createRuntime();
    const client = {
      cancel: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      setConfigOption: vi.fn(),
    };
    runtime.adapter = adapter;
    runtime.sessionId = 'session-1';
    runtime.client = client;
    runtime.activePrompt = Promise.resolve();

    await runtime.stop();

    expect(client.cancel).toHaveBeenCalledWith('session-1');
    expect(client.close).toHaveBeenCalledOnce();
    expect(runtime.client).toBeNull();
  });
});
