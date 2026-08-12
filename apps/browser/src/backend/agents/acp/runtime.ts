import { createHash, randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import type {
  ContentBlock,
  PromptCapabilities,
  CreateElicitationRequest,
  CreateElicitationResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionConfigOption,
  SessionNotification,
  SessionUpdate,
} from '@agentclientprotocol/sdk';
import type {
  ExternalAgentRuntime,
  ExternalAgentRuntimeContext,
  UtilityModelEntry,
} from '@stagewise/agent-core/host';
import type { AgentMessage } from '@stagewise/agent-core/types';
import type { ToolApprovalResponse } from 'ai';
import type { Logger } from '@/services/logger';
import type { ProviderInstanceTypeId } from '@shared/karton-contracts/ui/shared-types';
import type { AcpAdapter } from './adapter';
import { ACP_ADAPTERS, adapterForProviderType } from './adapter-registry';
import { AcpProcessClient } from './process-client';
import type { ResolveAcpEnvironment } from './process-client';
import { elicitationForm, requestScopeId } from './elicitation-mapper';
import { buildAcpPrompt, MAX_INLINE_IMAGE_BYTES } from './prompt-builder';
import {
  commandFromTool,
  isHiddenTool,
  isWorkspaceEdit,
  mapToolParts,
  primaryMountPrefix,
  toolName,
  toolImages,
  type ToolState,
  workspaceRoots,
} from './tool-mapper';
import {
  StagewiseFormLifecycle,
  type StagewiseInputResult,
} from './form-lifecycle';
import { StagewiseMcpBridge } from './stagewise-mcp-bridge';

type JsonObject = Record<string, unknown>;
type AssistantMessage = AgentMessage & { role: 'assistant' };
type ExternalAgentTurn = Parameters<ExternalAgentRuntime['runTurn']>[0];
type ClassifyCommand = (input: {
  toolCallId: string;
  command: string;
  cwdPrefix: string;
  agentExplanation: string;
}) => Promise<{ needsApproval: boolean; explanation: string }>;
type RecordApprovalExplanation = (
  toolCallId: string,
  explanation: string,
) => void;

interface PersistedSession {
  version: 2;
  adapterId: AcpAdapter['id'];
  processKey: string;
  sessionId: string;
}

interface PendingPermission {
  request: RequestPermissionRequest;
  resolve(response: RequestPermissionResponse): void;
}

const IMAGE_FILE_EXTENSIONS: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};
const CANCEL_GRACE_MS = 3_000;
const ACTIVE_COMMAND_SETTLE_MS = 1_000;
const MAX_STALE_COMMAND_RECOVERIES = 3;

export class AcpAgentRuntime implements ExternalAgentRuntime {
  private client: AcpProcessClient | null = null;
  private adapter: AcpAdapter | null = null;
  private processKey: string | null = null;
  private canResumeSession = false;
  private promptCapabilities: PromptCapabilities = {};
  private sessionId: string | null = null;
  private sessionOptions: SessionConfigOption[] = [];
  private stopped = true;
  private approvalMode = 'smart';
  private generation = 0;
  private runQueue: Promise<void> = Promise.resolve();
  private activePrompt: Promise<unknown> | null = null;
  private activeToolWaiter: (() => void) | null = null;
  private permissionRejected = false;
  private historyDiverged = false;
  private assistantMessage: AssistantMessage | null = null;
  private readonly parts = new Map<string, AssistantMessage['parts'][number]>();
  private readonly toolStates = new Map<string, ToolState>();
  private readonly pendingPermissions = new Map<string, PendingPermission>();
  private readonly pendingContentWrites = new Set<Promise<void>>();
  private readonly imageIds = new Set<string>();
  private readonly sessionFilePath: string;
  private readonly stagewiseMcp: StagewiseMcpBridge;
  private readonly forms: StagewiseFormLifecycle;

  public constructor(
    private readonly context: ExternalAgentRuntimeContext,
    private readonly logger: Logger,
    private readonly providerTypeForInstance: (
      providerInstanceId?: string,
    ) => ProviderInstanceTypeId | undefined,
    private readonly getThinkingOverride: (
      selection: UtilityModelEntry,
    ) => UtilityModelEntry['thinkingOverride'],
    private readonly agentDirectory: string,
    private readonly resolveEnvironment: ResolveAcpEnvironment,
    stagewiseMcpScriptPath: string,
    private readonly classifyCommand?: ClassifyCommand,
    private readonly recordApprovalExplanation?: RecordApprovalExplanation,
  ) {
    this.sessionFilePath = nodePath.join(agentDirectory, 'acp-session.json');
    this.forms = new StagewiseFormLifecycle(
      (input) => this.context.requestUserInput(input),
      () => this.context.cancelUserInput(),
      (id, part) => this.upsertPart(id, part),
    );
    this.stagewiseMcp = new StagewiseMcpBridge(
      stagewiseMcpScriptPath,
      (input, signal) => this.handleStagewiseToolRequest(input, signal),
      logger,
    );
  }

  public handles(selection: UtilityModelEntry): boolean {
    const typeId = this.providerTypeForInstance(selection.providerInstanceId);
    const handled = typeId
      ? adapterForProviderType(typeId) !== undefined
      : false;
    if (!handled) {
      this.historyDiverged = true;
      try {
        unlinkSync(this.sessionFilePath);
      } catch {}
    }
    return handled;
  }

  public runTurn(args: ExternalAgentTurn): Promise<void> {
    const generation = ++this.generation;
    const run = this.runQueue.then(async () => {
      if (generation !== this.generation) return;
      try {
        await this.runTurnNow(args, generation);
      } catch (error) {
        if (generation === this.generation) this.closeClient();
        throw error;
      }
    });
    this.runQueue = run.catch(() => {});
    return run;
  }

  private async runTurnNow(
    args: ExternalAgentTurn,
    generation: number,
  ): Promise<void> {
    const typeId = this.providerTypeForInstance(
      args.selection.providerInstanceId,
    );
    const adapter = typeId ? adapterForProviderType(typeId) : undefined;
    if (!adapter) throw new Error('Selected provider is not an ACP agent');

    if (this.historyDiverged) {
      this.closeClient();
      try {
        await unlink(this.sessionFilePath);
      } catch {}
      this.historyDiverged = false;
    }

    this.stopped = false;
    this.approvalMode = args.approvalMode;
    const roots = workspaceRoots(this.context.getMountedPaths());
    const cwd = roots[0] ?? this.agentDirectory;
    const sessionCreated = await this.ensureSession(adapter, cwd, roots);
    if (!this.isCurrent(generation)) return;
    await this.applySessionOptions(args.selection, this.sessionOptions);
    if (!this.isCurrent(generation)) return;

    this.assistantMessage = {
      id: randomUUID(),
      role: 'assistant',
      parts: [],
    };
    this.parts.clear();
    this.toolStates.clear();
    this.pendingPermissions.clear();
    this.imageIds.clear();

    const promptBlocks = await buildAcpPrompt(
      args.userMessages,
      this.context.getMountedPaths(),
      sessionCreated ? this.context.getState().history : [],
      this.promptCapabilities,
    );
    if (!this.isCurrent(generation)) return;
    const turn = this.promptUntilSettled(promptBlocks, generation);
    this.activePrompt = turn;
    try {
      await turn;
    } finally {
      if (this.activePrompt === turn) this.activePrompt = null;
    }
    await Promise.allSettled([...this.pendingContentWrites]);
    if (!this.isCurrent(generation)) return;
    this.finalizeParts();
  }

  public async respondToApproval(
    response: ToolApprovalResponse,
  ): Promise<boolean> {
    const pending = this.pendingPermissions.get(response.approvalId);
    if (!pending) return false;
    if (!response.approved) this.permissionRejected = true;
    pending.resolve(
      permissionResponse(pending.request.options, response.approved),
    );
    this.pendingPermissions.delete(response.approvalId);
    this.markApprovalResponded(response.approvalId, response);
    return true;
  }

  public async stop(approvalDenyReason?: string): Promise<void> {
    this.stopped = true;
    this.generation++;
    this.forms.cancelAll();
    this.activeToolWaiter?.();
    this.cancelPendingPermissions(approvalDenyReason);
    const client = this.client;
    const activePrompt = this.activePrompt;
    const restartAfterCancel = this.adapter?.restartAfterCancel === true;
    if (this.sessionId && client) {
      await client.cancel(this.sessionId).catch((error) => {
        this.logger.debug('[ACP runtime] Cancel failed', { error });
      });
    }
    if (activePrompt) {
      const settled = await settlesWithin(activePrompt, CANCEL_GRACE_MS);
      if ((!settled || restartAfterCancel) && this.client === client) {
        if (!settled) {
          this.logger.warn(
            '[ACP runtime] Agent did not stop after cancellation; restarting ACP process',
          );
        }
        this.closeClient();
      }
    }
  }

  public async resetThread(): Promise<void> {
    await this.stop();
    this.closeClient();
    try {
      await unlink(this.sessionFilePath);
    } catch {}
  }

  public async teardown(): Promise<void> {
    await this.stop();
    this.closeClient();
    await this.stagewiseMcp.close();
    await this.runQueue.catch(() => {});
  }

  private async ensureSession(
    adapter: AcpAdapter,
    cwd: string,
    roots: string[],
  ): Promise<boolean> {
    const processKey = `${adapter.id}:${
      adapter.processKeyForApproval?.(this.approvalMode) ?? 'default'
    }`;
    if (this.adapter?.id !== adapter.id || this.processKey !== processKey) {
      this.closeClient();
    }
    if (this.client && !this.client.isRunning()) this.closeClient();
    if (!this.client) {
      this.adapter = adapter;
      this.processKey = processKey;
      this.client = new AcpProcessClient(
        adapter,
        {
          onSessionUpdate: (notification) =>
            this.handleSessionUpdate(notification),
          onElicitation: (request) => this.handleElicitation(request),
          onPermission: (request) => this.handlePermission(request),
        },
        this.logger,
        this.resolveEnvironment,
      );
      const initialization = await this.client.start(this.approvalMode);
      this.canResumeSession =
        initialization.agentCapabilities?.sessionCapabilities?.resume != null;
      this.promptCapabilities =
        initialization.agentCapabilities?.promptCapabilities ?? {};
    }
    const mcpServers = [
      await this.stagewiseMcp.start(this.requireClient().getNodeExecutable()),
    ];
    if (this.sessionId) return false;

    const persisted = await this.readPersistedSession();
    const additionalDirectories = roots.slice(1);
    if (
      persisted?.adapterId === adapter.id &&
      persisted.processKey === this.processKey &&
      this.canResumeSession
    ) {
      try {
        const resumed = await this.requireClient().resumeSession({
          sessionId: persisted.sessionId,
          cwd,
          additionalDirectories,
          mcpServers,
        });
        this.sessionId = persisted.sessionId;
        this.sessionOptions = resumed.configOptions ?? [];
        return false;
      } catch (error) {
        this.logger.debug('[ACP runtime] Could not resume session', { error });
      }
    }

    const created = await this.requireClient().newSession({
      cwd,
      additionalDirectories,
      mcpServers,
      _meta: adapter.newSessionMeta?.(this.approvalMode),
    });
    this.sessionId = created.sessionId;
    this.sessionOptions = created.configOptions ?? [];
    await this.persistSession();
    return true;
  }

  private async applySessionOptions(
    selection: UtilityModelEntry,
    options: SessionConfigOption[],
  ): Promise<void> {
    let current = options;
    current = await this.setSelectOption(
      current,
      ['mode'],
      this.adapter?.sessionModeForApproval?.(this.approvalMode),
    );
    current = await this.setSelectOption(current, ['model'], selection.modelId);
    const override =
      selection.thinkingOverride ?? this.getThinkingOverride(selection);
    current = await this.setSelectOption(
      current,
      ['thought_level', 'reasoning_effort', 'effort'],
      override?.enabled === false
        ? findThinkingOffValue(current)
        : override?.value,
    );
    this.sessionOptions = current;
  }

  private async setSelectOption(
    options: SessionConfigOption[],
    ids: string[],
    value?: string,
  ): Promise<SessionConfigOption[]> {
    if (!value || !this.sessionId) return options;
    const option = options.find(
      (entry) =>
        entry.type === 'select' &&
        (ids.includes(entry.id) || ids.includes(entry.category ?? '')) &&
        flattenConfigOptions(entry).some(
          (candidate) => candidate.value === value,
        ),
    );
    if (!option || option.currentValue === value) return options;
    const result = await this.requireClient().setConfigOption({
      sessionId: this.sessionId,
      configId: option.id,
      value,
    });
    return result.configOptions;
  }

  private handleSessionUpdate(notification: SessionNotification): void {
    if (notification.sessionId !== this.sessionId || this.stopped) return;
    const update = notification.update;
    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        if (update.content.type === 'image') this.appendImage(update.content);
        else this.appendContent(update, 'text');
        break;
      case 'agent_thought_chunk':
        this.appendContent(update, 'reasoning');
        break;
      case 'tool_call':
      case 'tool_call_update':
        this.upsertTool(update);
        break;
      case 'plan':
        this.upsertPlan('acp-plan', update.entries);
        break;
      case 'plan_update':
        if (update.plan.type === 'items') {
          this.upsertPlan(
            `acp-plan:${update.plan.planId}`,
            update.plan.entries,
          );
        } else if (update.plan.type === 'markdown') {
          this.upsertPart(`acp-plan:${update.plan.planId}`, {
            type: 'text',
            text: update.plan.content,
            state: 'done',
          });
        }
        break;
      case 'plan_removed':
        this.removePart(`acp-plan:${update.planId}`);
        break;
      case 'usage_update':
        this.context.recordUsage(update.used, update.size);
        break;
      case 'config_option_update':
        this.sessionOptions = update.configOptions;
        break;
      default:
        break;
    }
  }

  private appendContent(
    update: Extract<
      SessionUpdate,
      { sessionUpdate: 'agent_message_chunk' | 'agent_thought_chunk' }
    >,
    type: 'text' | 'reasoning',
  ): void {
    if (update.content.type !== 'text') return;
    const id = `${type}:${update.messageId ?? 'current'}`;
    const previous = this.parts.get(id);
    this.upsertPart(id, {
      type,
      text: `${previous?.type === type ? previous.text : ''}${update.content.text}`,
      state: 'streaming',
    });
  }

  private appendImage(content: Extract<ContentBlock, { type: 'image' }>): void {
    const { data, mimeType } = content;
    if (Buffer.byteLength(data, 'base64') > MAX_INLINE_IMAGE_BYTES) {
      this.logger.warn('[ACP runtime] Ignoring oversized generated image');
      return;
    }
    const digest = createHash('sha256').update(data).digest('hex').slice(0, 16);
    const id = `image:${digest}`;
    if (this.imageIds.has(id)) return;
    this.imageIds.add(id);

    const extension = IMAGE_FILE_EXTENSIONS[mimeType] ?? 'img';
    const filename = `generated_${digest}.${extension}`;
    const generation = this.generation;
    const write = this.context
      .writeAttachment(filename, Buffer.from(data, 'base64'))
      .then(() => {
        if (!this.isCurrent(generation)) return;
        this.upsertPart(id, {
          type: 'file',
          mediaType: mimeType,
          filename,
          url: `attachment://${this.context.instanceId}/${encodeURIComponent(filename)}`,
        });
      })
      .catch((error) => {
        this.imageIds.delete(id);
        this.logger.warn('[ACP runtime] Failed to store generated image', {
          error,
        });
      })
      .finally(() => this.pendingContentWrites.delete(write));
    this.pendingContentWrites.add(write);
  }

  private upsertTool(update: ToolState, forceVisible = false): void {
    const previous = this.toolStates.get(update.toolCallId);
    const next = mergeToolState(previous, update);
    const merged = this.adapter?.normalizeTool?.(next) ?? next;
    this.toolStates.set(update.toolCallId, merged);
    this.activeToolWaiter?.();
    for (const image of toolImages(merged)) this.appendImage(image);
    const plan = this.adapter?.normalizePlan?.(merged);
    if (plan) {
      this.removePart(update.toolCallId);
      const planId = `acp-plan:${update.toolCallId}`;
      if (plan.length > 0) {
        this.upsertPlan(planId, plan);
      } else {
        this.removePart(planId);
      }
      return;
    }
    if (
      isHiddenTool(
        merged,
        this.adapter?.hiddenToolNames,
        this.adapter?.hiddenToolPathPrefixes,
      )
    ) {
      this.removeToolParts(update.toolCallId);
      return;
    }
    if (
      !forceVisible &&
      merged.kind === 'edit' &&
      !merged.content?.some((content) => content.type === 'diff') &&
      !merged.locations?.length &&
      merged.status !== 'completed' &&
      merged.status !== 'failed'
    ) {
      this.removePart(update.toolCallId);
      return;
    }
    const mountedPaths = this.context.getMountedPaths();
    const mapped = mapToolParts(merged, mountedPaths);
    const activeIds = new Set(mapped.map(({ id }) => id));
    for (const { id, part } of mapped) {
      this.upsertPart(
        id,
        this.pendingPermissions.has(update.toolCallId)
          ? {
              ...part,
              state: 'approval-requested',
              approval: { id: update.toolCallId },
            }
          : part,
      );
    }
    for (const id of this.parts.keys()) {
      if (id.startsWith(`${update.toolCallId}:diff:`) && !activeIds.has(id)) {
        this.removePart(id);
      }
    }
  }

  private upsertPlan(
    id: string,
    entries: Array<{ content: string; status: string }>,
  ): void {
    this.upsertPart(id, {
      type: 'dynamic-tool',
      toolName: 'acp.plan',
      toolCallId: id,
      state: 'output-available',
      input: {
        plan: entries.map((entry) => ({
          step: entry.content,
          status: entry.status === 'in_progress' ? 'inProgress' : entry.status,
        })),
      },
      output: { status: 'completed' },
    });
  }

  private async handlePermission(
    request: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    if (this.stopped || request.sessionId !== this.sessionId) {
      return { outcome: { outcome: 'cancelled' } };
    }
    const previous = this.toolStates.get(request.toolCall.toolCallId);
    const tool = mergeToolState(previous, request.toolCall);
    const hidden = isHiddenTool(
      tool,
      this.adapter?.hiddenToolNames,
      this.adapter?.hiddenToolPathPrefixes,
    );
    if (hidden) this.removeToolParts(tool.toolCallId);
    if (
      hidden ||
      isWorkspaceEdit(tool, this.context.getMountedPaths()) ||
      this.approvalMode === 'alwaysAllow'
    ) {
      return permissionResponse(request.options, true);
    }
    if (
      this.approvalMode === 'smart' &&
      tool.kind === 'execute' &&
      this.classifyCommand
    ) {
      const generation = this.generation;
      const decision = await this.classifyCommand({
        toolCallId: tool.toolCallId,
        command: commandFromTool(tool),
        cwdPrefix: primaryMountPrefix(this.context.getMountedPaths()),
        agentExplanation: tool.title ?? '',
      }).catch((error) => {
        this.logger.warn('[ACP runtime] Smart approval failed closed', {
          error,
        });
      });
      if (!this.isCurrent(generation) || request.sessionId !== this.sessionId) {
        return { outcome: { outcome: 'cancelled' } };
      }
      if (decision?.needsApproval === false) {
        return permissionResponse(request.options, true);
      }
      if (decision) {
        this.recordApprovalExplanation?.(tool.toolCallId, decision.explanation);
      }
    }

    const id = request.toolCall.toolCallId;
    return new Promise((resolve) => {
      if (!this.pendingPermissions.has(id)) {
        this.context.notifyApprovalRequested(
          id,
          toolName(tool) || tool.kind || 'tool',
        );
      }
      this.pendingPermissions.set(id, { request, resolve });
      this.upsertTool(tool, true);
    });
  }

  private handleStagewiseToolRequest(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<StagewiseInputResult> {
    if (this.stopped) throw new Error('Agent is no longer running');
    return this.forms.request(
      input as JsonObject,
      `stagewise-mcp:${randomUUID()}`,
      signal,
    );
  }

  private async handleElicitation(
    request: CreateElicitationRequest,
  ): Promise<CreateElicitationResponse> {
    if (
      this.stopped ||
      ('sessionId' in request && request.sessionId !== this.sessionId)
    ) {
      return { action: 'cancel' };
    }
    const form = elicitationForm(request);
    if (!form) return { action: 'cancel' };
    const result = await this.forms.request(form, requestScopeId(request));
    if (
      this.stopped ||
      ('sessionId' in request && request.sessionId !== this.sessionId)
    ) {
      return { action: 'cancel' };
    }
    if (!result.completed || result.cancelled) return { action: 'cancel' };
    return { action: 'accept', content: result.answers };
  }

  private markApprovalResponded(
    id: string,
    response: Pick<ToolApprovalResponse, 'approved' | 'reason'>,
    state: 'approval-responded' | 'output-denied' = 'approval-responded',
  ): void {
    for (const [partId, part] of this.parts) {
      if (!('approval' in part) || part.approval?.id !== id) continue;
      this.upsertPart(partId, {
        ...part,
        state,
        approval: {
          id,
          approved: response.approved,
          reason: response.reason,
        },
      });
    }
  }

  private finalizeParts(): void {
    if (!this.assistantMessage) return;
    for (const [id, part] of this.parts) {
      if (part.type === 'text' || part.type === 'reasoning') {
        this.parts.set(id, { ...part, state: 'done' });
      } else if (
        'state' in part &&
        part.state === 'approval-responded' &&
        part.approval?.approved === false
      ) {
        this.parts.set(id, {
          ...part,
          state: 'output-denied',
          approval: { ...part.approval, approved: false },
        });
      } else if (
        'state' in part &&
        (part.state === 'input-available' ||
          part.state === 'input-streaming' ||
          part.state === 'approval-responded')
      ) {
        this.parts.set(id, {
          ...part,
          state: 'output-available',
          output: 'output' in part ? part.output : { status: 'completed' },
        } as AssistantMessage['parts'][number]);
      }
    }
    this.publishParts();
  }

  private upsertPart(id: string, part: JsonObject): void {
    if (!this.assistantMessage) return;
    this.parts.set(id, part as AssistantMessage['parts'][number]);
    this.publishParts();
  }

  private removePart(id: string): void {
    if (!this.parts.delete(id)) return;
    this.publishParts();
  }

  private removeToolParts(toolCallId: string): void {
    let changed = false;
    for (const id of this.parts.keys()) {
      if (id === toolCallId || id.startsWith(`${toolCallId}:diff:`)) {
        changed = this.parts.delete(id) || changed;
      }
    }
    if (changed) this.publishParts();
  }

  private publishParts(): void {
    if (!this.assistantMessage) return;
    this.assistantMessage = {
      ...this.assistantMessage,
      parts: [...this.parts.values()],
    };
    this.context.upsertAssistantMessage(this.assistantMessage);
  }

  private isCurrent(generation: number): boolean {
    return !this.stopped && generation === this.generation;
  }

  private async promptUntilSettled(
    initialPrompt: ContentBlock[],
    generation: number,
  ): Promise<void> {
    let prompt = initialPrompt;
    let staleCommandRecoveries = 0;
    do {
      this.permissionRejected = false;
      await this.requireClient().prompt({
        sessionId: this.sessionId!,
        prompt,
      });
      if (!this.isCurrent(generation)) return;

      const continueAfterRejection =
        this.permissionRejected &&
        this.adapter?.continueAfterPermissionRejection === true;
      if (continueAfterRejection) {
        prompt = [
          {
            type: 'text',
            text:
              'Continue from the rejected tool call. Treat the rejection as ' +
              'the user response, do not retry the rejected action unless ' +
              'explicitly requested, and continue the remaining task.',
          },
        ];
        continue;
      }

      const staleCommands = await this.waitForActiveCommands(generation);
      if (!this.isCurrent(generation) || staleCommands.length === 0) return;
      this.failStaleCommands(staleCommands);
      staleCommandRecoveries++;
      if (staleCommandRecoveries > MAX_STALE_COMMAND_RECOVERIES) return;
      prompt = [
        {
          type: 'text',
          text:
            'The previous command ended without a final ACP status update. ' +
            'Do not retry it. Continue the remaining task using the output ' +
            'already shown.',
        },
      ];
    } while (this.isCurrent(generation));
  }

  private async waitForActiveCommands(generation: number): Promise<string[]> {
    while (this.activeCommandIds().length > 0 && this.isCurrent(generation)) {
      const updated = await new Promise<boolean>((resolve) => {
        let settled = false;
        let timeout: ReturnType<typeof setTimeout>;
        const finish = (value: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        };
        timeout = setTimeout(() => finish(false), ACTIVE_COMMAND_SETTLE_MS);
        this.activeToolWaiter = () => finish(true);
      });
      this.activeToolWaiter = null;
      if (!updated) return this.activeCommandIds();
    }
    this.activeToolWaiter = null;
    return [];
  }

  private activeCommandIds(): string[] {
    return [...this.toolStates.values()].flatMap((tool) =>
      tool.kind === 'execute' &&
      tool.status !== 'completed' &&
      tool.status !== 'failed'
        ? [tool.toolCallId]
        : [],
    );
  }

  private failStaleCommands(toolCallIds: string[]): void {
    for (const toolCallId of toolCallIds) {
      const tool = this.toolStates.get(toolCallId);
      if (!tool) continue;
      this.logger.warn('[ACP runtime] Command ended without terminal status', {
        toolCallId,
      });
      this.upsertTool({ ...tool, status: 'failed' });
    }
  }

  private requireClient(): AcpProcessClient {
    if (!this.client) throw new Error('ACP client is not started');
    return this.client;
  }

  private closeClient(): void {
    this.forms.cancelAll();
    this.cancelPendingPermissions();
    this.client?.close();
    this.client = null;
    this.adapter = null;
    this.processKey = null;
    this.canResumeSession = false;
    this.promptCapabilities = {};
    this.sessionId = null;
    this.sessionOptions = [];
  }

  private cancelPendingPermissions(
    reason = 'Agent session ended before approval was answered.',
  ): void {
    for (const [id, pending] of this.pendingPermissions) {
      pending.resolve({ outcome: { outcome: 'cancelled' } });
      this.markApprovalResponded(
        id,
        {
          approved: false,
          reason,
        },
        'output-denied',
      );
    }
    this.pendingPermissions.clear();
  }

  private async readPersistedSession(): Promise<PersistedSession | null> {
    try {
      const parsed = JSON.parse(
        await readFile(this.sessionFilePath, 'utf8'),
      ) as PersistedSession;
      return parsed.version === 2 && ACP_ADAPTERS[parsed.adapterId]
        ? parsed
        : null;
    } catch {
      return null;
    }
  }

  private async persistSession(): Promise<void> {
    if (!this.adapter || !this.sessionId) return;
    await mkdir(this.agentDirectory, { recursive: true });
    await writeFile(
      this.sessionFilePath,
      JSON.stringify({
        version: 2,
        adapterId: this.adapter.id,
        processKey: this.processKey ?? `${this.adapter.id}:default`,
        sessionId: this.sessionId,
      } satisfies PersistedSession),
      'utf8',
    );
  }
}

function permissionResponse(
  options: RequestPermissionRequest['options'],
  approved: boolean,
): RequestPermissionResponse {
  const preferred = approved
    ? ['allow_once', 'allow_always']
    : ['reject_once', 'reject_always'];
  const option = preferred.flatMap((kind) =>
    options.filter((option) => option.kind === kind),
  )[0];
  return option
    ? { outcome: { outcome: 'selected', optionId: option.optionId } }
    : { outcome: { outcome: 'cancelled' } };
}

function settlesWithin(promise: Promise<unknown>, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    void promise.then(
      () => {
        clearTimeout(timeout);
        resolve(true);
      },
      () => {
        clearTimeout(timeout);
        resolve(true);
      },
    );
  });
}

function flattenConfigOptions(
  option: Extract<SessionConfigOption, { type: 'select' }>,
): Array<{ value: string }> {
  return option.options.flatMap((entry) =>
    'group' in entry ? entry.options : [entry],
  );
}

function findThinkingOffValue(
  options: SessionConfigOption[],
): string | undefined {
  return options
    .flatMap((option) =>
      option.type === 'select' &&
      ['thought_level', 'reasoning_effort', 'effort'].some(
        (id) => id === option.id || id === option.category,
      )
        ? flattenConfigOptions(option)
        : [],
    )
    .find((option) =>
      ['none', 'off', 'disabled'].includes(option.value.toLowerCase()),
    )?.value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeToolState(
  previous: ToolState | undefined,
  update: ToolState,
): ToolState {
  const meta = {
    ...(isJsonObject(previous?._meta) ? previous._meta : {}),
    ...(isJsonObject(update._meta) ? update._meta : {}),
  };
  const merged = {
    ...previous,
    ...update,
    _meta: meta,
  } as ToolState;
  const terminalExit = isJsonObject(meta.terminal_exit)
    ? meta.terminal_exit.exit_code
    : undefined;
  return merged.kind === 'execute' && typeof terminalExit === 'number'
    ? {
        ...merged,
        status: terminalExit === 0 ? 'completed' : 'failed',
      }
    : merged;
}
