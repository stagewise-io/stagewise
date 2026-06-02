import type {
  AgentNotificationEvent,
  BaseAgent,
  BaseAgentDependencies,
  BaseAgentToolboxView,
} from '../../agents/base-agent';
import type { AgentTypeRegistry } from '../../agents/agents-registry';
import { toAgentsMap, type AgentsMap } from '../../agents/agents-map';
import type { AgentHost } from '../../host/host';
import type { CommandRegistry } from '../../commands/command-registry';
import type { Logger } from '../../host/logger';
import type { AgentPersistenceDB } from '../agent-persistence/db';
import type { AttachmentsService } from '../attachments';
import type { ProcessedImageCacheService } from '../processed-image-cache';
import type { FileReadCacheService } from '../file-read-cache';
import { DisposableService } from '../shared/disposable';
import type { AgentStore } from '../../store/agent-store';
import {
  DomainAdapterRegistry,
  type DomainAdapter,
  type DomainId,
} from '../../env/contract';
import {
  type AgentHistoryEntry,
  type AgentMessage,
  type AgentState,
  AgentTypes,
} from '../../types/agent';
import {
  DEFAULT_TOOL_APPROVAL_MODE,
  toolApprovalModeSchema,
  type ToolApprovalMode,
} from '../../types/tool-approval';
import type { ExtraMentionRenderer } from '../../agents/shared/message-conversion';
import {
  extractSlashIdsFromText,
  redactSlashIdsForTelemetry,
} from '../../agents/shared/metadata-converter/slash-items';
import type { AgentManagerStartupPolicy } from './startup-policy';
import type { AgentManagerToolboxPort } from './ports';
import {
  bindStateMutations,
  deleteAgentInstance,
  getAgentInstance,
  setToolApprovalMode,
  upsertAgentInstance,
  type AgentInstanceEnvelope,
} from './state-mutations';
import type { AgentManagerOptions } from './options';
import { generateAttachmentFilename } from './attachment-filename';
import { randomUUID } from 'node:crypto';
import type { UserMessageMetadata } from '../../types/metadata';

function toFiniteTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  if (typeof value === 'string') {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  return undefined;
}

/**
 * @note Due to the complex type inference for all this stuff, we sometimes explicitly define types here to avoid errors.
 *       This is a bit of a hack, but it's the best we can do for now.
 */

export class AgentManager extends DisposableService {
  /** Server-side bounds for user-editable agent titles. Slightly more permissive
   * than the UI's 2–80 range so minor client/server drift never silently drops
   * a valid title. */
  private static readonly TITLE_MIN_LENGTH = 1;
  private static readonly TITLE_MAX_LENGTH = 200;

  private activeAgents = new Map<
    string,
    BaseAgent<any, any> | BaseAgent<never, any>
  >();

  private readonly commandRegistry: CommandRegistry;
  private readonly managerToolbox: AgentManagerToolboxPort;
  private readonly agentToolbox: BaseAgentToolboxView;
  private readonly logger: Logger;
  /**
   * The agent-core capability seam. Threaded into every `BaseAgent`
   * instance via `BaseAgentDependencies.host` so the core never imports
   * browser services directly. Also the sole source of `logger`,
   * `telemetry`, and `models` consumed by this manager.
   */
  private readonly host: AgentHost;
  /**
   * Registry of host-defined agent constructors. Used to satisfy the
   * core's spawn-child-agent path without the core having to import
   * concrete subclasses.
   */
  private readonly agentTypeRegistry: AgentTypeRegistry;
  private readonly agentsMap: AgentsMap;
  private readonly renderHostMention?: ExtraMentionRenderer;
  /**
   * Optional host hook forwarded to every {@link BaseAgent} so the host
   * can surface user-facing lifecycle notifications (done/question/error)
   * without coupling core to host UI. See {@link AgentNotificationEvent}.
   */
  private readonly onAgentEvent?: (
    event: AgentNotificationEvent,
    agentId: string,
  ) => void | Promise<void>;
  /**
   * Optional host hook that augments raw {@link AgentHistoryEntry}
   * rows from {@link AgentPersistenceDB} with data only the host can
   * resolve (live git summaries, on-disk path validation). Invoked
   * from {@link getAgentsHistoryList}; when absent, rows are passed
   * through unmodified so core stays host-agnostic.
   */
  private readonly enrichHistoryEntries?: (
    entries: AgentHistoryEntry[],
  ) => Promise<AgentHistoryEntry[]>;
  private readonly imageCache?: ProcessedImageCacheService;
  /**
   * App-wide `FileReadCacheService` shared across all agent instances.
   * Constructed once during bootstrap and threaded into every `BaseAgent`.
   */
  private readonly fileReadCache: FileReadCacheService;
  /**
   * Per-agent attachment blob store. Owned by `AgentCorePersistence`,
   * passed through to every `BaseAgent` instance, and used directly
   * here for the `agents.storeAttachment(...)` RPC and hard-delete
   * cleanup.
   */
  private readonly attachments: AttachmentsService;
  /**
   * Canonical in-memory state container shared with the host. All
   * per-instance writes flow through the
   * `services/agent-manager/state-mutations` utilities so the
   * one-`store.update`-per-intent discipline (D18) is enforced in one
   * place.
   */
  private readonly agentStore: AgentStore;
  /**
   * Skill roster for slash-command telemetry redaction. Defaults to
   * `() => []` when the host does not supply skills.
   */
  private readonly getSkillsForSlashRedaction: () => ReadonlyArray<{
    id: string;
    source: unknown;
  }>;
  private readonly startupPolicy: AgentManagerStartupPolicy;
  private unregisterCommands: () => void = () => {};
  private readonly commandUnregisters: Array<() => void> = [];

  /**
   * Owned by `AgentCorePersistence`. Constructed before the manager
   * and passed in fully initialised — every method can use the
   * non-null happy path. If persistence is broken, the facade fails
   * boot before this manager is ever instantiated.
   */
  private readonly persistenceDb: AgentPersistenceDB;

  /**
   * Registry of {@link DomainAdapter}s threaded into every `BaseAgent`.
   * Hosts wire every adapter (core- and host-owned) via
   * {@link registerEnvAdapter}; `AgentManager` no longer registers any
   * adapter itself.
   */
  private readonly domainAdapterRegistry: DomainAdapterRegistry;

  public constructor(options: AgentManagerOptions) {
    super();
    const {
      host,
      commandRegistry,
      agentTypeRegistry,
      startupPolicy,
      state,
      storage,
      tools,
      hooks,
    } = options;

    this.host = host;
    this.logger = host.logger;
    this.commandRegistry = commandRegistry;
    this.managerToolbox = tools.managerToolbox;
    this.agentToolbox = tools.agentToolbox;
    this.agentStore = state.store;
    this.persistenceDb = storage.persistenceDb;
    this.attachments = storage.attachments;
    this.fileReadCache = storage.fileReadCache;
    this.imageCache = storage.imageCache;
    this.startupPolicy = startupPolicy;
    this.agentTypeRegistry = agentTypeRegistry;
    this.agentsMap = toAgentsMap(agentTypeRegistry);
    this.renderHostMention = hooks?.renderHostMention;
    this.onAgentEvent = hooks?.onAgentEvent;
    this.enrichHistoryEntries = hooks?.enrichHistoryEntries;
    this.getSkillsForSlashRedaction =
      hooks?.skillsForSlashRedaction ?? (() => []);

    this.domainAdapterRegistry = new DomainAdapterRegistry(host.logger);

    this.unregisterCommands = this.registerCommandHandlers();

    // The persistence DB is owned by `AgentCorePersistence` and is
    // fully migrated by the time the host hands it to us, so the
    // startup-policy fire-and-forget can run immediately instead of
    // chaining off a `dbReadyPromise`.
    this.applyStartupPolicy();
  }

  /**
   * Fire-and-forget execution of the configured {@link
   * AgentManagerStartupPolicy}. Runs at the tail of the constructor;
   * the DB is already ready by definition (Phase D.3).
   */
  private applyStartupPolicy(): void {
    if (this.startupPolicy.kind === 'none') return;
    const { agentType, mountLastWorkspaces } = this.startupPolicy;
    void (async () => {
      const agent = await this.createAgent(agentType, undefined);
      if (!mountLastWorkspaces) return;
      const lastWorkspaces =
        await this.persistenceDb.getLastChatWorkspacePaths();
      if (!lastWorkspaces) return;
      for (const ws of lastWorkspaces) {
        try {
          // Default the startup-restored mount to the main worktree
          // (idempotent for already-main paths) so a fresh app launch
          // matches the `agents.create` default behavior.
          const mountPath = this.managerToolbox.resolveNewAgentMountPath
            ? await this.managerToolbox.resolveNewAgentMountPath(ws.path)
            : ws.path;
          await this.managerToolbox.handleMountWorkspace(
            agent.instanceId,
            mountPath,
            ws.permissions,
          );
        } catch (error) {
          this.logger.warn(
            `[AgentManager] Failed to mount workspace ${ws.path} on startup`,
            { error },
          );
        }
      }
    })();
  }

  private report(
    error: Error,
    operation: string,
    extra?: Record<string, unknown>,
  ) {
    this.host.telemetry?.captureException(error, {
      service: 'agent-manager',
      operation,
      ...extra,
    });
  }

  /**
   * Register a {@link DomainAdapter}. Replaces any adapter previously
   * registered for the same `domainId`. Hosts call this at startup for
   * every adapter — including the core-owned adapters constructed from
   * `@stagewise/agent-core/env/adapters` — so `AgentManager` itself stays
   * host-agnostic and never reaches for host-specific deps.
   */
  public registerEnvAdapter(adapter: DomainAdapter): void {
    this.domainAdapterRegistry.register(adapter);
  }

  /**
   * Unregister an env adapter by `domainId`. Primarily used by tests and
   * host shutdown paths.
   */
  public unregisterEnvAdapter(domainId: DomainId): void {
    this.domainAdapterRegistry.unregister(domainId);
  }

  /** Registers one command handler on the package command registry. */
  private wrapAgentRpc(
    name: `${string}.${string}`,
    fn: (...args: any[]) => unknown | Promise<unknown>,
  ): void {
    const unregister = this.commandRegistry.registerCommand(
      name,
      async (_ctx, args: unknown) => {
        const list = args as unknown[];
        return await fn(...list);
      },
    );
    this.commandUnregisters.push(unregister);
  }

  /** Register all agent command handlers on the registry. */
  private registerCommandHandlers(): () => void {
    this.wrapAgentRpc(
      'agents.create',
      async (
        initialInputState?: string,
        modelId?: string,
        toolApprovalMode?: string,
        workspacePaths?: string[],
        preserveWorkspacePaths?: boolean,
      ) => {
        const initialState: Partial<AgentState> = {};
        if (modelId) initialState.activeModelId = modelId;
        if (toolApprovalMode) initialState.toolApprovalMode = toolApprovalMode;

        const agent = await this.createAgent(
          AgentTypes.CHAT,
          undefined,
          undefined,
          Object.keys(initialState).length > 0 ? initialState : undefined,
          undefined,
          initialInputState,
        );
        if (workspacePaths) {
          for (const wp of workspacePaths) {
            // By default, mount the repository's main worktree rather
            // than whichever linked worktree the user happened to pass
            // — most users intuitively expect a new agent to start at
            // the canonical checkout. Callers that want the exact
            // path mounted (e.g. when explicitly creating an agent
            // for a specific worktree) opt out via
            // `preserveWorkspacePaths`.
            const mountPath =
              preserveWorkspacePaths ||
              !this.managerToolbox.resolveNewAgentMountPath
                ? wp
                : await this.managerToolbox.resolveNewAgentMountPath(wp);
            await this.managerToolbox.handleMountWorkspace(
              agent.instanceId,
              mountPath,
            );
          }
        } else {
          const lastWorkspaces =
            await this.persistenceDb.getLastChatWorkspacePaths();
          if (lastWorkspaces) {
            for (const ws of lastWorkspaces) {
              try {
                // Same remap applies to the last-workspaces fallback:
                // if a previous session left a linked-worktree mount,
                // a fresh agent should still default to the main
                // worktree. Idempotent for already-main paths.
                const mountPath = this.managerToolbox.resolveNewAgentMountPath
                  ? await this.managerToolbox.resolveNewAgentMountPath(ws.path)
                  : ws.path;
                await this.managerToolbox.handleMountWorkspace(
                  agent.instanceId,
                  mountPath,
                  ws.permissions,
                );
              } catch (error) {
                this.logger.warn(
                  `[AgentManager] Failed to auto-mount workspace ${ws.path}`,
                  { error },
                );
              }
            }
          }
        }
        return agent.instanceId;
      },
    );
    this.wrapAgentRpc('agents.resume', async (instanceId: string) => {
      await this.resumeAgent(instanceId);
      return;
    });

    this.wrapAgentRpc(
      'agents.sendUserMessage',
      async (instanceId: string, message: AgentMessage & { role: 'user' }) => {
        await this.sendUserMessage(instanceId, message);
      },
    );
    this.wrapAgentRpc(
      'agents.interruptQuestionWithMessage',
      async (
        instanceId: string,
        questionId: string,
        message: AgentMessage & { role: 'user' },
        draftAnswers: Record<string, unknown>,
      ) => {
        // Queue the message FIRST, then resolve the question — both in
        // one backend call so there's no race between separate RPCs.
        try {
          await this.sendUserMessage(instanceId, message);
        } finally {
          this.managerToolbox.cancelQuestion(
            instanceId,
            questionId,
            'user_sent_message',
            draftAnswers,
          );
        }
      },
    );
    this.wrapAgentRpc(
      'agents.sendToolApprovalResponse',
      async (
        instanceId: string,
        approvalId: string,
        approved: boolean,
        reason?: string,
      ) => {
        await this.sendToolApprovalResponse(
          instanceId,
          approvalId,
          approved,
          reason,
        );
      },
    );
    this.wrapAgentRpc(
      'agents.setToolApprovalMode',
      async (
        instanceId: string,
        mode: ToolApprovalMode,
        source?: 'panel-combobox' | 'inline-approval-button',
      ) => {
        const parsedMode = toolApprovalModeSchema.parse(mode);
        await this.setToolApprovalMode(instanceId, parsedMode, { source });
      },
    );
    this.wrapAgentRpc('agents.stop', async (instanceId: string) => {
      await this.stopAgent(instanceId);
    });
    this.wrapAgentRpc('agents.flushQueue', async (instanceId: string) => {
      await this.flushQueue(instanceId);
    });
    this.wrapAgentRpc('agents.clearQueue', async (instanceId: string) => {
      await this.clearQueue(instanceId);
    });
    this.wrapAgentRpc(
      'agents.deleteQueuedMessage',
      async (instanceId: string, messageId: string) => {
        await this.deleteQueuedMessage(instanceId, messageId);
      },
    );
    this.wrapAgentRpc(
      'agents.revertToUserMessage',
      async (
        instanceId: string,
        userMessageId: string,
        undoToolCalls: boolean,
      ) => {
        await this.revertToUserMessage(
          instanceId,
          userMessageId,
          undoToolCalls,
        );
      },
    );
    this.wrapAgentRpc(
      'agents.replaceUserMessage',
      async (
        instanceId: string,
        userMessageId: string,
        newMessage: AgentMessage & { role: 'user' },
        undoToolCalls: boolean,
      ) => {
        return await this.replaceUserMessage(
          instanceId,
          userMessageId,
          newMessage,
          undoToolCalls,
        );
      },
    );
    this.wrapAgentRpc('agents.delete', async (instanceId: string) => {
      await this.deleteAgent(instanceId);
    });
    this.wrapAgentRpc('agents.archive', async (instanceId: string) => {
      await this.archiveAgent(instanceId);
    });
    // `agents.markAsRead` lives on the AgentCoreBridge — handler is
    // in `agent-core-bridge/handlers/agents.ts` and writes through
    // the host `HostAgentStateMutations.setUnread` helper.
    this.wrapAgentRpc(
      'agents.setActiveModelId',
      async (instanceId: string, modelId: string) => {
        await this.updateActiveModelId(instanceId, modelId);
      },
    );
    this.wrapAgentRpc(
      'agents.setTitle',
      async (instanceId: string, title: string) => {
        const trimmed = title.trim();
        if (
          trimmed.length < AgentManager.TITLE_MIN_LENGTH ||
          trimmed.length > AgentManager.TITLE_MAX_LENGTH
        ) {
          throw new Error(
            `Invalid title length: ${trimmed.length} (must be ${AgentManager.TITLE_MIN_LENGTH}–${AgentManager.TITLE_MAX_LENGTH} chars)`,
          );
        }

        // Active path: let the agent handle it so Karton state updates and
        // titleLockedByUser is set via the normal state mutation.
        // The raw title is only transmitted at `full` telemetry. Titles
        // frequently contain project names, snippets, or other identifying
        // strings — `basic` should stay content-free.
        const isFullTelemetry = this.host.telemetry?.level === 'full';

        const agent = this.activeAgents.get(instanceId);
        if (agent) {
          await agent.setTitle(trimmed);
          // Read the type from Karton state rather than `agent.agentType`
          // to stay consistent with other emit sites in this file and
          // avoid coupling telemetry to a specific BaseAgent subclass shape.
          const agentType =
            this.agentStore.get().agents.instances[instanceId]?.type;
          this.host.telemetry?.capture('agent-renamed', {
            agent_instance_id: instanceId,
            was_active: true,
            new_title_length: trimmed.length,
            ...(agentType && { agent_type: agentType }),
            ...(isFullTelemetry && { new_title: trimmed }),
          });
          return;
        }

        // Inactive path: update the persisted row directly — no hydration,
        // no Karton fan-out; the UI's optimistic local update is authoritative
        // until the next history refetch.
        const updated = await this.persistenceDb.updateAgentTitle(
          instanceId,
          trimmed,
        );
        if (!updated) {
          throw new Error(`Agent with instance id ${instanceId} not found`);
        }
        this.host.telemetry?.capture('agent-renamed', {
          agent_instance_id: instanceId,
          was_active: false,
          new_title_length: trimmed.length,
          ...(isFullTelemetry && { new_title: trimmed }),
        });
      },
    );
    this.wrapAgentRpc(
      'agents.getAgentsHistoryList',
      async (offset: number, limit: number, searchString?: string) => {
        return await this.getAgentsHistoryList(offset, limit, searchString);
      },
    );
    this.wrapAgentRpc(
      'agents.updateInputState',
      async (instanceId: string, inputState: string) => {
        await this.updateInputState(instanceId, inputState);
      },
    );
    this.wrapAgentRpc(
      'agents.retryLastUserMessage',
      async (instanceId: string) => {
        await this.retryLastUserMessage(instanceId);
      },
    );
    this.wrapAgentRpc(
      'agents.storeAttachment',
      async (
        agentId: string,
        originalFileName: string,
        data: string,
      ): Promise<string> => {
        const fileName = generateAttachmentFilename(originalFileName);
        const buffer = Buffer.from(data, 'base64');
        await this.attachments.write(agentId, fileName, buffer);
        return fileName;
      },
    );
    this.wrapAgentRpc(
      'agents.storeAttachmentByPath',
      async (
        agentId: string,
        originalFileName: string,
        filePath: string,
      ): Promise<string> => {
        const fileName = generateAttachmentFilename(originalFileName);
        await this.attachments.write(agentId, fileName, filePath);
        return fileName;
      },
    );
    this.wrapAgentRpc('agents.getStoredInstance', async (agentId: string) => {
      const row = await this.persistenceDb.getStoredAgentInstanceById(agentId);
      if (!row) return null;

      const mountedWorkspaces = row.mountedWorkspaces
        ? row.mountedWorkspaces.map((w) => ({
            ...w,
            isGitRepo: false,
            gitBranch: null,
          }))
        : null;

      return {
        id: row.id,
        type: row.type,
        title: row.title,
        createdAt: row.createdAt,
        lastMessageAt: row.lastMessageAt,
        activeModelId: row.activeModelId,
        messageCount: row.history.length,
        mountedWorkspaces,
      };
    });
    this.wrapAgentRpc('agents.getTouchedFiles', async (agentId: string) => {
      return this.managerToolbox.getEditedFilePathsForAgent(agentId);
    });
    this.wrapAgentRpc(
      'agents.revealWorkingDirectory',
      async (agentId: string) => {
        try {
          // Agent's own per-instance data directory inside user-data — not
          // the mounted user project. This is the dev-option "working dir"
          // exposed via the context menu: where the agent's attachments,
          // shell logs, apps, etc. live on disk.
          const dir = this.host.paths.agentDir(agentId);
          const desktop = this.host.desktop;
          if (!desktop) {
            return {
              success: false,
              error: 'Host does not support revealPathInFileManager',
            };
          }
          const errorMessage = await desktop.revealPathInFileManager(dir);
          if (errorMessage) {
            return { success: false, error: errorMessage };
          }
          return { success: true };
        } catch (error) {
          this.report(
            error instanceof Error ? error : new Error(String(error)),
            'revealWorkingDirectory',
          );
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    );
    return () => {
      for (const unregister of this.commandUnregisters.splice(0)) {
        unregister();
      }
    };
  }

  protected async onTeardown(): Promise<void> {
    this.unregisterCommands();
    for (const agent of this.activeAgents.values()) {
      await agent.onTeardown();
    }
    this.activeAgents.clear();
  }

  /**
   * Trigger WORKSPACE.md generation for a specific workspace path.
   * Finds a parent chat agent that has this path mounted and spawns
   * a workspace-md agent under it.
   */
  public async generateWorkspaceMdForPath(
    workspacePath: string,
  ): Promise<void> {
    let parentAgentId: string | undefined;
    for (const [agentId, toolboxState] of Object.entries(
      this.agentStore.get().toolbox,
    )) {
      if (toolboxState.workspace.mounts.some((m) => m.path === workspacePath)) {
        parentAgentId = agentId;
        break;
      }
    }

    await this.createAgent(
      AgentTypes.WORKSPACE_MD,
      { workspacePath },
      {
        parentInstanceId: parentAgentId ?? '',
        onFinish: async () => {
          const readMd = this.host.readWorkspaceMdFromDisk;
          if (!readMd) {
            throw new Error(
              'AgentHost.readWorkspaceMdFromDisk is required for workspace-md generation',
            );
          }
          const content = await readMd(workspacePath);
          this.managerToolbox.setWorkspaceMdContent(
            workspacePath,
            content ?? '',
          );
        },
        onError: (error) => {
          this.report(error, 'workspaceMdGenerationFailed');
          this.logger.error('[AgentManager] WorkspaceMd generation failed', {
            error,
          });
        },
      },
    );
  }

  // Create a new agent. Should be called when the user creates a new agent.
  public async createAgent(
    type: AgentTypes,
    instanceConfig: any,
    parent?: {
      parentInstanceId: string;
      onFinish: (finishOutput: unknown) => void | Promise<void>;
      onError: (error: Error) => void | Promise<void>;
    },
    initialState?: Partial<AgentState>,
    instanceId?: string,
    initialInputState?: string,
  ): Promise<BaseAgent<any, any>> {
    const agentInstanceId = instanceId ?? randomUUID();

    // For new chat agents (not resumed), use the model from the last persisted chat
    // Validate the model still exists (it may have been a deleted custom model)
    const lastChatModelId = await this.persistenceDb.getLastChatModelId();
    const lastModelValid =
      lastChatModelId && this.host.models.has(lastChatModelId);

    // Build state object outside setState to avoid "Type instantiation is excessively deep" error
    // caused by complex Draft<[]> inference from the 'ai' package's UIMessage type
    const defaultState: AgentState = {
      title: '',
      isWorking: false,
      history: [],
      queuedMessages: [],
      activeModelId: 'claude-sonnet-4.6',
      toolApprovalMode: DEFAULT_TOOL_APPROVAL_MODE,
      pendingApprovals: {},
      inputState: initialInputState ?? '',
      usedTokens: 0,
    };

    // Seed the new envelope on the canonical AgentStore. The bridge
    // forward-mirror projects the result back to Karton for existing
    // readers.
    upsertAgentInstance(this.agentStore, agentInstanceId, {
      type: type,
      canSelectModel: (this.agentsMap as any)[type].config.allowModelSelection,
      requiredModelCapabilities: (this.agentsMap as any)[type].config
        .requiredCapabilities,
      allowUserInput: (this.agentsMap as any)[type].config.allowUserInput,
      parentAgentInstanceId: parent?.parentInstanceId ?? null,
      state: { ...defaultState, ...(initialState ?? {}) } as AgentState,
    } as AgentInstanceEnvelope);

    this.logger.info(
      `[AgentManager] Creating agent. ID: ${agentInstanceId}, Type: ${type}`,
    );

    const Ctor = this.agentTypeRegistry.get(type);
    if (!Ctor) {
      throw new Error(
        `AgentManager: agent type "${String(type)}" is not registered in AgentTypeRegistry`,
      );
    }

    // The registry stores constructors as `unknown`. We cast through
    // `unknown` here because the host narrows generic parameters
    // (`UIAgentTools`, host `AgentMessage`/`AgentState`) that the
    // core's default `BaseAgentDependencies` widens — the runtime
    // shapes are structurally compatible but TS treats them as
    // nominally distinct. The runtime contract is enforced by
    // `BaseAgent`'s own constructor.
    const agent = new (
      Ctor as unknown as new (
        deps: BaseAgentDependencies<any, any>,
      ) => BaseAgent<any, any, any>
    )({
      instanceId: agentInstanceId,
      // The host's `AgentState` / `AgentMessage` / `AgentStateMutations`
      // bundle carry the host's wider `UserMessageMetadata` (browser-
      // tab mentions) and the `ToolApprovalMode` literal, while
      // core's defaults are structurally narrower. The runtime shapes
      // are compatible — cast the whole `state` envelope at the seam.
      state: {
        // `BaseAgent.set` / `.get` route through the canonical
        // AgentStore; readers still observe the slice through Karton
        // via the bridge forward-mirror.
        get: () => {
          const instance = getAgentInstance(this.agentStore, agentInstanceId);
          if (!instance) {
            throw new Error(
              `AgentManager: missing agent instance ${agentInstanceId} at BaseAgent.get`,
            );
          }
          return instance.state as AgentState;
        },
        // The recipe channel is retired. The runloop writes through
        // the bound state-mutation bundle built once per agent.
        commands: bindStateMutations(this.agentStore, agentInstanceId),
        persist: (dirtyMessageIndices?: number[]) =>
          this.persistAgentState(agentInstanceId, dirtyMessageIndices),
      } as unknown as BaseAgentDependencies<any, any>['state'],
      host: this.host,
      toolbox: this.agentToolbox,
      caches: {
        fileReadCache: this.fileReadCache,
        processedImageCache: this.imageCache,
      },
      attachments: this.attachments,
      domainAdapterRegistry: this.domainAdapterRegistry,
      instanceConfig,
      spawnChildAgentHandler: async (
        childAgentType,
        childInstanceConfig,
        onFinish,
        onError,
      ) => {
        return (await this.spawnChildAgent(
          agentInstanceId,
          childAgentType,
          // The registry-driven generic on `spawnChildAgentHandler`
          // resolves through `AgentCtor<T>`; the host-side
          // `spawnChildAgent` uses `AgentTypeMap[T]`. Both reduce to
          // the same underlying constructor type after host
          // augmentation, but TS treats them as nominally distinct
          // generics. Cross-cast at the seam.
          childInstanceConfig as any,
          onFinish as any,
          onError,
        )) as any;
      },
      finishToolHandler: parent?.onFinish,
      finishToolErrorHandler: parent?.onError,
      agentTypeRegistry: this.agentTypeRegistry,
      initialState: (initialState ?? {
        activeModelId:
          lastModelValid && type === AgentTypes.CHAT
            ? lastChatModelId
            : undefined,
      }) as BaseAgentDependencies<any, any>['initialState'],
      renderExtraMention: this.renderHostMention,
      notificationEventHandler: this.onAgentEvent,
    });

    this.activeAgents.set(agentInstanceId, agent);

    this.host.telemetry?.capture('agent-created', {
      agent_type: type,
      agent_instance_id: agentInstanceId,
      model_id:
        this.agentStore.get().agents.instances[agentInstanceId]?.state
          .activeModelId ?? 'unknown',
    });

    return agent as BaseAgent<any, any>;
  }

  private async spawnChildAgent(
    parentInstanceId: string,
    childAgentType: AgentTypes,
    instanceConfig: any,
    onFinish: (finishOutput: unknown) => void | Promise<void>,
    onError: (error: Error) => void | Promise<void>,
  ): Promise<BaseAgent<any, any>> {
    const childAgent = await this.createAgent(childAgentType, instanceConfig, {
      parentInstanceId: parentInstanceId,
      onFinish: onFinish,
      onError: onError,
    });

    return childAgent;
  }

  // Resume an agent from the last persisted state. Should probably be called when the user select the agent from a list of previous agents.
  public async resumeAgent(instanceId: string) {
    // Early exit if the agent is already active.
    if (this.activeAgents.has(instanceId)) {
      return this.activeAgents.get(instanceId);
    }

    this.logger.debug(`[AgentManager] Resuming agent. ID: ${instanceId}`);

    const agent =
      await this.persistenceDb.getStoredAgentInstanceById(instanceId);
    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    // Right now, we don't allow resuming sub-agents (because persisted agents stop all their tools calls anyway when they arew stopped and resumed - including any child agents).
    if (agent.parentAgentInstanceId) {
      throw new Error(
        `Agent with instance id ${instanceId} is a sub-agent and cannot be resumed`,
      );
    }

    // Validate that the persisted model still exists (it may have been a deleted custom model)
    const resumedModelValid =
      agent.activeModelId && this.host.models.has(agent.activeModelId);

    const createdAgent = await this.createAgent(
      agent.type,
      agent.instanceConfig as any,
      undefined,
      {
        title: agent.title,
        titleLockedByUser: agent.titleLockedByUser ?? undefined,
        history: agent.history as AgentMessage[],
        queuedMessages: agent.queuedMessages as (AgentMessage & {
          role: 'user';
        })[],
        activeModelId: resumedModelValid ? agent.activeModelId : undefined,
        toolApprovalMode: agent.toolApprovalMode ?? DEFAULT_TOOL_APPROVAL_MODE,
        inputState: agent.inputState,
        usedTokens: agent.usedTokens,
        isWorking: false,
      },
      instanceId,
    );

    if (agent.mountedWorkspaces && Array.isArray(agent.mountedWorkspaces)) {
      for (const ws of agent.mountedWorkspaces) {
        try {
          await this.managerToolbox.handleMountWorkspace(
            instanceId,
            ws.path,
            ws.permissions,
          );
        } catch (error) {
          this.logger.warn(
            `[AgentManager] Failed to re-mount workspace ${ws.path} for agent ${instanceId}`,
            { error },
          );
        }
      }
    }

    this.host.telemetry?.capture('agent-resumed', {
      agent_type: agent.type,
      agent_instance_id: instanceId,
    });

    return createdAgent;
  }

  private async persistAgentState(
    instanceId: string,
    dirtyMessageIndices?: number[],
  ) {
    // Store agent state into DB.
    const agent = this.activeAgents.get(instanceId);

    const envelope = getAgentInstance(this.agentStore, instanceId);
    const agentState = envelope?.state;

    if (!agent || !agentState) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    if (agentState.history.length === 0) {
      // We don't persist empty agents.
    }

    const mountedWorkspaces =
      this.managerToolbox.getWorkspaceSnapshotForPersistence(instanceId);
    const firstHistoryEntry = agentState.history[0];
    const lastHistoryEntry = agentState.history[agentState.history.length - 1];

    await this.persistenceDb.storeAgentInstance(
      {
        id: instanceId,
        type: agent.agentType,
        title: agentState.title,
        titleLockedByUser: agentState.titleLockedByUser,
        activeModelId: agentState.activeModelId,
        toolApprovalMode: agentState.toolApprovalMode as ToolApprovalMode,
        createdAt:
          (firstHistoryEntry?.metadata as UserMessageMetadata | undefined)
            ?.createdAt ?? new Date(0), // Fallback should never be reached
        lastMessageAt:
          (lastHistoryEntry?.metadata as UserMessageMetadata | undefined)
            ?.createdAt ?? new Date(), // Fallback should never be reached
        queuedMessages: agentState.queuedMessages,
        inputState: agentState.inputState,
        usedTokens: agentState.usedTokens,
        mountedWorkspaces,
      },
      agentState.history,
      dirtyMessageIndices,
    );
  }

  /**
   * Deletes an agent and all it's child agents permanently.
   *
   * @param instanceId The agent instance that should be deleted
   *
   * @note If you just want to stop an agent and remove it from the list of loaded agents, use the `archiveAgent` method instead.
   */
  private async deleteAgent(instanceId: string) {
    this.logger.debug(`[AgentManager] Deleting agent. ID: ${instanceId}`);

    const agentType =
      this.agentStore.get().agents.instances[instanceId]?.type ?? 'unknown';

    // Recursively delete all child agents first
    const childAgentInstanceIds = Object.entries(
      this.agentStore.get().agents.instances,
    )
      .filter(([_, instance]) => instance.parentAgentInstanceId === instanceId)
      .map(([id]) => id);
    for (const childAgentInstanceId of childAgentInstanceIds) {
      await this.deleteAgent(childAgentInstanceId);
    }

    // Archive this agent (stops it, tears down resources, removes from active state)
    await this.archiveAgent(instanceId);

    // Clear the agent from the persistence layer
    await this.persistenceDb.deleteAgentInstance(instanceId);

    // Permanently remove on-disk attachment blobs (archive intentionally
    // preserves them so a resumed agent can still access its attachments).
    void this.attachments.deleteAgentBlobs(instanceId);

    this.host.telemetry?.capture('agent-deleted', {
      agent_type: agentType,
      agent_instance_id: instanceId,
    });
  }

  /**
   * Stops an agent and deletes it's active instance while keeping the persisted state intact - must be resumed when it should be opened again.
   * @param instanceId The agent instance that should be archived (stopped and only persistence kept)
   */
  private async archiveAgent(instanceId: string) {
    this.logger.debug(`[AgentManager] Archiving agent. ID: ${instanceId}`);
    // Stop this agent and all child agents
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      return;
    }

    await agent.stop();

    // Make sure to let the agent finish tool return with a failure so that a potential parent understands that the agent instance was deleted.
    await agent.reportErrorToParent(
      new Error("Agent was stopped and deleted before finishing it's task."),
    );

    // Accept all pending diffs before archiving so no "hanging" diffs remain
    try {
      await this.managerToolbox.acceptAllPendingEditsForAgent(instanceId);
    } catch (error) {
      this.logger.error(
        `[AgentManager] Failed to accept pending edits for agent ${instanceId}`,
        error,
      );
    }

    // Delete all child agents as well. Do this recursively.
    const childAgentInstanceIds = Object.entries(
      this.agentStore.get().agents.instances,
    )
      .filter(([_, instance]) => instance.parentAgentInstanceId === instanceId)
      .map(([id]) => id);
    for (const childAgentInstanceId of childAgentInstanceIds) {
      const childAgent = this.activeAgents.get(childAgentInstanceId);
      await childAgent?.onTeardown();
      await this.archiveAgent(childAgentInstanceId);
    }

    await agent.onTeardown();

    // Clear the active agents map.
    this.activeAgents.delete(instanceId);

    // Clear the AgentStore-canonical agent + toolbox envelopes. The
    // bridge forward-mirror deletes the same keys in Karton.
    deleteAgentInstance(this.agentStore, instanceId);

    this.host.telemetry?.capture('agent-archived', {
      agent_type: agent.agentType,
      agent_instance_id: instanceId,
    });
  }

  /**
   * ===============================
   * KARTON HANDLERS
   * ===============================
   */

  /**
   * Send a message to a specific agent
   */
  public async sendUserMessage(
    instanceId: string,
    message: AgentMessage & { role: 'user' },
  ) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    const instance = this.agentStore.get().agents.instances[instanceId];
    const attachmentParts = message.parts.filter((p) => p.type === 'file');
    const slashCommandIds = extractSlashIdsFromText(
      message.parts as ReadonlyArray<{ type: string; text?: string }>,
    );
    // Redact before sending to telemetry: workspace/global skill IDs are
    // user-controlled (filesystem-derived) and can leak project/branch/
    // personal names. Only builtin/plugin IDs pass through as plaintext.
    const slashCommandIdsForTelemetry = redactSlashIdsForTelemetry(
      slashCommandIds,
      this.getSkillsForSlashRedaction() as any,
    );
    const connectedWorkspaceCount =
      this.agentStore.get().toolbox[instanceId]?.workspace?.mounts?.length ?? 0;

    // Measure chat age / last-message gap *before* the message is dispatched
    // so the numbers reflect the state the user saw when sending.
    const historyBefore = instance?.state.history ?? [];
    const hasPriorUserMessage = historyBefore.some((m) => m.role === 'user');
    const lastMessage = historyBefore[historyBefore.length - 1];
    const lastMessageTs = toFiniteTimestamp(lastMessage?.metadata?.createdAt);
    const msSinceLastMessage =
      lastMessageTs !== undefined ? Date.now() - lastMessageTs : undefined;

    this.host.telemetry?.capture('agent-message-sent', {
      agent_type: instance?.type ?? 'unknown',
      agent_instance_id: instanceId,
      model_id: instance?.state.activeModelId ?? 'unknown',
      has_attachments: attachmentParts.length > 0,
      attachment_count: attachmentParts.length,
      slash_command_ids: slashCommandIdsForTelemetry,
      slash_command_count: slashCommandIds.length,
      connected_workspace_count: connectedWorkspaceCount,
      is_new_chat: !hasPriorUserMessage,
      ms_since_last_message: msSinceLastMessage,
      tool_approval_mode: (instance?.state.toolApprovalMode ??
        'alwaysAsk') as ToolApprovalMode,
    });

    // Host `AgentMessage` carries narrowed `UserMessageMetadata`
    // (browser-specific mention kinds) while the core default widens
    // these. Cast at the seam — the runtime shape is identical.
    await agent.sendUserMessage(message as any);
  }

  /**
   * Send a tool approval response to a specific agent
   */
  public async sendToolApprovalResponse(
    instanceId: string,
    approvalId: string,
    approved: boolean,
    reason?: string,
  ) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.sendToolApprovalResponse({
      type: 'tool-approval-response',
      approvalId: approvalId,
      approved: approved,
      reason: reason,
    });
  }

  /**
   * Update the per-agent tool approval policy. Persists immediately so the
   * change survives agent resume. Safe to call on empty agents (no
   * history) because it uses a narrow DB update that bypasses the full
   * `persistAgentState` path.
   */
  public async setToolApprovalMode(
    instanceId: string,
    mode: ToolApprovalMode,
    telemetry?: {
      /** Which UI surface triggered the change; threaded from the RPC. */
      source?: 'panel-combobox' | 'inline-approval-button';
      /**
       * Only meaningful when `source === 'inline-approval-button'`:
       * the approval ID the user was responding to. Lets analytics
       * correlate the mode change with a specific approval request.
       */
      toolCallId?: string;
      /** Tool name for `inline-approval-button`; optional otherwise. */
      toolName?: string;
    },
  ) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    const currentMode =
      this.agentStore.get().agents.instances[instanceId]?.state
        .toolApprovalMode ?? 'alwaysAsk';
    // No-op calls aren't logged — otherwise the combobox's onValueChange
    // firing on a reselection would emit spurious events.
    if (currentMode === mode) return;

    setToolApprovalMode(this.agentStore, instanceId, mode);

    await this.persistenceDb.updateToolApprovalMode(instanceId, mode);

    this.host.telemetry?.capture('tool-approval-mode-changed', {
      agent_instance_id: instanceId,
      previous_mode: currentMode as ToolApprovalMode,
      new_mode: mode,
      source: telemetry?.source ?? 'unknown',
      ...(telemetry?.toolCallId && { tool_call_id: telemetry.toolCallId }),
      ...(telemetry?.toolName && { tool_name: telemetry.toolName }),
    });
  }

  /**
   * Stop a specific agent
   */
  public async stopAgent(instanceId: string) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    const childAgents = Object.entries(this.agentStore.get().agents.instances)
      .filter(([_, instance]) => instance.parentAgentInstanceId === instanceId)
      .map(([id]) => id);

    for (const childAgentInstanceId of childAgents) {
      await this.stopAgent(childAgentInstanceId);
    }

    const history =
      this.agentStore.get().agents.instances[instanceId]?.state.history ?? [];
    const now = Date.now();
    let lastUserTs: number | undefined;
    let lastAgentTs: number | undefined;
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      if (!m) continue;
      const createdAt = m.metadata?.createdAt;
      if (createdAt === undefined) continue;

      const ts = toFiniteTimestamp(createdAt);
      if (ts === undefined) continue;

      if (lastUserTs === undefined && m.role === 'user') lastUserTs = ts;
      if (lastAgentTs === undefined && m.role === 'assistant') lastAgentTs = ts;
      if (lastUserTs !== undefined && lastAgentTs !== undefined) break;
    }

    await agent.stop();

    this.host.telemetry?.capture('agent-stopped', {
      agent_type: agent.agentType,
      agent_instance_id: instanceId,
      ms_since_last_user_message:
        lastUserTs !== undefined ? now - lastUserTs : undefined,
      ms_since_last_agent_message:
        lastAgentTs !== undefined ? now - lastAgentTs : undefined,
    });
  }

  /**
   * Flush the queue of a specific agent
   */
  public async flushQueue(instanceId: string) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.flushQueue();
  }

  /**
   * Clear the queue of a specific agent
   */
  public async clearQueue(instanceId: string) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.clearQueue();
  }

  /**
   * Delete queued message of an agent
   */
  public async deleteQueuedMessage(instanceId: string, messageId: string) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.deleteQueuedMessage(messageId);
  }

  /**
   * Revert to a user message of an agent
   * @param instanceId
   * @param userMessageId
   * @param undoToolCalls
   */
  public async revertToUserMessage(
    instanceId: string,
    userMessageId: string,
    undoToolCalls: boolean,
  ) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.revertToUserMessage(userMessageId, undoToolCalls);
  }

  public async replaceUserMessage(
    instanceId: string,
    userMessageId: string,
    newMessage: AgentMessage & { role: 'user' },
    undoToolCalls: boolean,
  ): Promise<string> {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    return await agent.replaceUserMessage(
      userMessageId,
      // See note in sendUserMessage — host AgentMessage is structurally
      // compatible with core but TS rejects the nominal mismatch.
      newMessage as any,
      undoToolCalls,
    );
  }

  /**
   * Retry the last user message that resulted in an error
   * @param instanceId
   */
  public async retryLastUserMessage(instanceId: string): Promise<void> {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.retryLastUserMessage();
  }

  private async updateInputState(instanceId: string, inputString: string) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.updateInputState(inputString);
  }

  private async updateActiveModelId(instanceId: string, modelId: string) {
    const agent = this.activeAgents.get(instanceId);
    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }
    if (!this.host.models.has(modelId)) {
      throw new Error(
        `Cannot set model: "${modelId}" does not exist (it may have been deleted)`,
      );
    }
    const fromModel =
      this.agentStore.get().agents.instances[instanceId]?.state.activeModelId ??
      'unknown';
    await agent.updateActiveModelId(modelId);
    this.host.telemetry?.capture('agent-model-changed', {
      agent_type: agent.agentType,
      agent_instance_id: instanceId,
      from_model: fromModel,
      to_model: modelId,
    });
  }

  /**
   * Responds with a list of agent history entries. Includes all existing agents (including currently active ones) and is sorted by agents (newest first).
   *
   * @param offset The offset to fetch the agents from
   * @param limit The number of agents to fetch
   * @param searchString The search string to filter the agents by (optional, case-insensitive)
   * @returns A list of agent history entries
   */
  private async getAgentsHistoryList(
    offset: number,
    limit: number,
    searchString?: string,
  ): Promise<AgentHistoryEntry[]> {
    const entries = await this.persistenceDb.getAgentHistoryEntries(
      limit,
      offset,
      [],
      searchString && searchString.trim().length > 0
        ? `%${searchString.trim()}%`
        : undefined,
    );
    return this.enrichHistoryEntries
      ? await this.enrichHistoryEntries(entries)
      : entries;
  }
}
