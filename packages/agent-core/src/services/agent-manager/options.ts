import type {
  AgentNotificationEvent,
  BaseAgentToolboxView,
} from '../../agents/base-agent';
import type { AgentTypeRegistry } from '../../agents/agents-registry';
import type { ExtraMentionRenderer } from '../../agents/shared/message-conversion';
import type { CommandRegistry } from '../../commands/command-registry';
import type { AgentHost } from '../../host/host';
import type { AgentStore } from '../../store/agent-store';
import type { AgentPersistenceDB } from '../agent-persistence/db';
import type { AttachmentsService } from '../attachments';
import type { FileReadCacheService } from '../file-read-cache';
import type { ProcessedImageCacheService } from '../processed-image-cache';
import type { AgentHistoryEntry } from '../../types/agent';
import type { AgentManagerToolboxPort } from './ports';
import type { AgentManagerStartupPolicy } from './startup-policy';

/**
 * Live-state seam for the canonical {@link AgentStore} agent slice.
 *
 * Per-instance writes flow through `AgentManager` directly against
 * `store` via the `services/agent-manager/state-mutations` utilities;
 * hosts that need additional setters (e.g. browser's `setUnread`,
 * `recordPendingApproval`) build them on the exported
 * `updateAgentInstanceState` helper rather than swapping out a writer.
 */
export interface AgentManagerStateOptions {
  /** Canonical in-memory state container shared with the host. */
  store: AgentStore;
}

/**
 * Durable + caching dependencies. All four are host-constructed because
 * they own filesystem/database resources that outlive a single agent.
 *
 * `imageCache` is optional — only hosts that adapt images to model
 * constraints wire it.
 */
export interface AgentManagerStorageOptions {
  persistenceDb: AgentPersistenceDB;
  attachments: AttachmentsService;
  fileReadCache: FileReadCacheService;
  imageCache?: ProcessedImageCacheService;
}

/**
 * The two distinct toolbox roles `AgentManager` consumes.
 *
 * - `managerToolbox` is called by lifecycle paths inside `AgentManager`
 *   itself (mount workspace, cancel question, snapshot for persistence,
 *   accept pending edits...).
 * - `agentToolbox` is handed down to every spawned `BaseAgent` so it
 *   can list tools, drain attachments, fetch workspace metadata, etc.
 *
 * Hosts may pass the same object twice when one implementation
 * satisfies both interfaces structurally (the browser does); the CLI
 * supplies two narrow adapters.
 */
export interface AgentManagerToolsOptions {
  managerToolbox: AgentManagerToolboxPort;
  agentToolbox: BaseAgentToolboxView;
}

/**
 * Optional host hooks. Each member is independently optional; pass an
 * empty `hooks: {}` (or omit it entirely) to keep agent-core fully
 * default-behavior.
 */
export interface AgentManagerHooksOptions {
  /**
   * Notified on agent lifecycle milestones (done/question/error) so
   * the host can surface user-facing notifications without coupling
   * the core to host UI. See {@link AgentNotificationEvent}.
   */
  onAgentEvent?: (
    event: AgentNotificationEvent,
    agentId: string,
  ) => void | Promise<void>;
  /**
   * Renders host-specific mention markup that core doesn't recognise
   * (e.g. browser-tab mentions in the chat input). Returning
   * `undefined` falls back to core's default mention formatting.
   */
  renderHostMention?: ExtraMentionRenderer;
  /**
   * Skill roster used purely for slash-command telemetry redaction.
   * Defaults to `() => []`. A future revision is expected to move
   * skills onto `AgentStore`, at which point this hook can be removed.
   */
  skillsForSlashRedaction?: () => ReadonlyArray<{
    id: string;
    source: unknown;
  }>;
  /**
   * Enrich the agent history list with host-resolvable data that core
   * cannot compute itself (e.g. live git summaries via the host's
   * git service, or filtering out workspaces whose directory no
   * longer exists on disk). Called once per `agents.getAgentsHistoryList`
   * RPC with the raw rows from {@link AgentPersistenceDB}.
   *
   * When omitted, history rows are returned verbatim from persistence
   * — agent-core stays fully host-agnostic (no fs/git access).
   */
  enrichHistoryEntries?: (
    entries: AgentHistoryEntry[],
  ) => Promise<AgentHistoryEntry[]>;
}

/**
 * Constructor options for {@link AgentManager}.
 *
 * Replaces the legacy 18-positional-arg signature with a single
 * grouped object so call sites are self-documenting and adding a new
 * optional dependency never re-orders existing ones.
 *
 * Notable consolidations vs. the legacy signature:
 *   - `logger`, `telemetry`, and `modelCatalog` are no longer separate
 *     params — `AgentManager` reads them from {@link host} (the same
 *     `AgentHost` it threads into every `BaseAgent`).
 *   - The two former `toolbox` params live under {@link tools} with
 *     clearer names (`managerToolbox` vs. `agentToolbox`).
 *   - Optional host callbacks live under {@link hooks}.
 */
export interface AgentManagerOptions {
  /**
   * Capability seam threaded into every `BaseAgent`. Also the sole
   * source for {@link AgentHost.logger}, {@link AgentHost.telemetry},
   * and {@link AgentHost.models}, which `AgentManager` consumes
   * internally.
   */
  host: AgentHost;
  commandRegistry: CommandRegistry;
  /** Maps `AgentTypes` ids to host-defined agent constructors. */
  agentTypeRegistry: AgentTypeRegistry;
  /**
   * What `AgentManager` should do at boot — typically `'none'` for the
   * CLI/tests and `'auto-create-default'` for the desktop app.
   */
  startupPolicy: AgentManagerStartupPolicy;
  state: AgentManagerStateOptions;
  storage: AgentManagerStorageOptions;
  tools: AgentManagerToolsOptions;
  hooks?: AgentManagerHooksOptions;
}
