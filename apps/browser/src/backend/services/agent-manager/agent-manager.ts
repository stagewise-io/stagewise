import type {
  AgentManagerStartupPolicy,
  AgentManagerToolboxPort,
  AgentManagerTelemetryPort,
  AgentManagerModelCatalogPort,
  AgentNotificationEvent,
  AgentStore,
  CommandRegistry,
  CommandName,
  CommandContext,
} from '@stagewise/agent-core';
import { AgentManager } from '@stagewise/agent-core';
import type { AgentHost } from '@stagewise/agent-core/host';
import type {
  AgentTypeRegistry,
  BaseAgentToolboxView,
} from '@stagewise/agent-core/agents';
import type { ProcessedImageCacheService } from '@stagewise/agent-core/processed-image-cache';
import type { FileReadCacheService } from '@stagewise/agent-core/file-read-cache';
import type { AttachmentsService } from '@stagewise/agent-core/attachments';
import type { AgentPersistenceDB } from '@stagewise/agent-core/agent-persistence';
import type { DomainAdapter, DomainId } from '@stagewise/agent-core/env';
import { DisposableService } from '../disposable';
import type { KartonService } from '../karton';
import type { Logger } from '../logger';
import type { AgentState } from '@shared/karton-contracts/ui/agent';
import type { UserMessageMetadata } from '@shared/karton-contracts/ui/agent/metadata';
import type { UIAgentTools } from '@shared/karton-contracts/ui/agent/tools/types';
import type { SkillDefinitionUI } from '@shared/skills';
import type { AgentInstancesStateController } from '../agent-core-bridge/state/agent-instances';
import { renderBrowserExtraMention } from '@/agents/shared/base-agent/utils';

const AGENT_RPC_COMMANDS = [
  'agents.create',
  'agents.resume',
  'agents.sendUserMessage',
  'agents.interruptQuestionWithMessage',
  'agents.sendToolApprovalResponse',
  'agents.setToolApprovalMode',
  'agents.stop',
  'agents.flushQueue',
  'agents.clearQueue',
  'agents.deleteQueuedMessage',
  'agents.revertToUserMessage',
  'agents.replaceUserMessage',
  'agents.delete',
  'agents.archive',
  'agents.setActiveModelId',
  'agents.setTitle',
  'agents.getAgentsHistoryList',
  'agents.updateInputState',
  'agents.retryLastUserMessage',
  'agents.storeAttachment',
  'agents.storeAttachmentByPath',
  'agents.getStoredInstance',
  'agents.getTouchedFiles',
  'agents.revealWorkingDirectory',
] as const satisfies ReadonlyArray<CommandName>;

export class AgentManagerService extends DisposableService {
  private readonly manager: AgentManager<
    UIAgentTools,
    UserMessageMetadata,
    AgentState
  >;
  private readonly commandRegistry: CommandRegistry;
  private readonly karton: KartonService;

  public constructor(
    karton: KartonService,
    commandRegistry: CommandRegistry,
    telemetryService: AgentManagerTelemetryPort,
    toolbox: AgentManagerToolboxPort,
    logger: Logger,
    modelCatalog: AgentManagerModelCatalogPort,
    agentInstancesController: AgentInstancesStateController,
    agentStore: AgentStore,
    getSkillsForSlashRedaction: () => ReadonlyArray<
      Pick<SkillDefinitionUI, 'id' | 'source'>
    >,
    startupPolicy: AgentManagerStartupPolicy,
    fileReadCacheService: FileReadCacheService,
    attachments: AttachmentsService,
    agentDb: AgentPersistenceDB,
    agentCoreHost: AgentHost,
    agentTypeRegistry: AgentTypeRegistry,
    _assetCacheService: unknown,
    processedImageCacheService?: ProcessedImageCacheService,
    notificationEventHandler?: (
      event: AgentNotificationEvent,
      agentId: string,
    ) => void | Promise<void>,
  ) {
    super();
    this.commandRegistry = commandRegistry;
    this.karton = karton;
    this.manager = new AgentManager<
      UIAgentTools,
      UserMessageMetadata,
      AgentState
    >(
      commandRegistry,
      telemetryService,
      toolbox,
      toolbox as unknown as BaseAgentToolboxView,
      logger,
      modelCatalog,
      agentInstancesController,
      agentStore,
      getSkillsForSlashRedaction,
      startupPolicy,
      fileReadCacheService,
      attachments,
      agentDb,
      agentCoreHost,
      agentTypeRegistry,
      renderBrowserExtraMention,
      processedImageCacheService,
      notificationEventHandler,
    );
    this.registerKartonForwarders();
  }

  /**
   * Forwarding handle for {@link AgentManager.registerEnvAdapter}. Both
   * core-owned and host-owned env-state adapters wire in via this
   * method from the bootstrap site in `main.ts` (see
   * `registerHostEnvDomainAdapters` plus the individual core-adapter
   * `createXxxDomainAdapter(...)` registrations).
   */
  public registerEnvAdapter(adapter: DomainAdapter): void {
    this.manager.registerEnvAdapter(adapter);
  }

  /**
   * Forwarding handle for {@link AgentManager.unregisterEnvAdapter}.
   * Primarily exposed for tests and host shutdown paths.
   */
  public unregisterEnvAdapter(domainId: DomainId): void {
    this.manager.unregisterEnvAdapter(domainId);
  }

  public async generateWorkspaceMdForPath(
    workspacePath: string,
  ): Promise<void> {
    await this.manager.generateWorkspaceMdForPath(workspacePath);
  }

  private registerKartonForwarders(): void {
    for (const name of AGENT_RPC_COMMANDS) {
      this.karton.registerServerProcedureHandler(
        name as any,
        async (callingClientId: string, ...rest: unknown[]) => {
          const ctx: CommandContext = { callerId: callingClientId };
          return await this.commandRegistry.dispatch(name, ctx, rest);
        },
      );
    }
  }

  protected async onTeardown(): Promise<void> {
    await this.manager.teardown();
  }
}
