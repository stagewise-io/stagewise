import { powerSaveBlocker } from 'electron';
import type { AppState } from '@shared/karton-contracts/ui';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import type { GlobalConfig } from '@shared/karton-contracts/ui/shared-types';
import { syncDerivedState } from '../utils/sync-derived-state';
import { DisposableService } from './disposable';
import type { KartonService } from './karton';
import type { Logger } from './logger';

type PowerSaveState = {
  enabled: boolean;
  hasActiveAgent: boolean;
};

function messageHasPendingApproval(message: AgentMessage): boolean {
  if (message.role !== 'assistant') return false;

  return message.parts.some((part) => {
    if (!(part.type === 'dynamic-tool' || part.type.startsWith('tool-'))) {
      return false;
    }

    return (part as { state?: string }).state === 'approval-requested';
  });
}

function hasPendingToolApproval(history: AgentMessage[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (message?.role === 'assistant') {
      return messageHasPendingApproval(message);
    }
  }

  return false;
}

function agentIsActiveForPowerSave(
  state: AppState,
  agentInstanceId: string,
): boolean {
  const agent = state.agents.instances[agentInstanceId];
  if (!agent?.state.isWorking) return false;

  if (state.toolbox[agentInstanceId]?.pendingUserQuestion) return false;

  return !hasPendingToolApproval(agent.state.history);
}

function derivePowerSaveState(state: AppState): PowerSaveState {
  const config: GlobalConfig = state.globalConfig;
  const enabled = config.blockAppSuspensionWhenAgentsActive ?? true;

  if (!enabled) return { enabled, hasActiveAgent: false };

  return {
    enabled,
    hasActiveAgent: Object.keys(state.agents.instances).some((agentId) =>
      agentIsActiveForPowerSave(state, agentId),
    ),
  };
}

export class AgentPowerSaveBlockerService extends DisposableService {
  private blockerId: number | null = null;
  private unsubscribe: (() => void) | null = null;

  private constructor(
    private readonly logger: Logger,
    private readonly uiKarton: KartonService,
  ) {
    super();
  }

  public static create(
    logger: Logger,
    uiKarton: KartonService,
  ): AgentPowerSaveBlockerService {
    const instance = new AgentPowerSaveBlockerService(logger, uiKarton);
    instance.initialize();
    return instance;
  }

  private initialize(): void {
    this.unsubscribe = syncDerivedState(
      this.uiKarton,
      derivePowerSaveState,
      ({ enabled, hasActiveAgent }) => {
        this.setBlocked(enabled && hasActiveAgent);
      },
      {
        fireImmediately: true,
      },
    );
  }

  private setBlocked(shouldBlock: boolean): void {
    if (shouldBlock) {
      if (
        this.blockerId !== null &&
        powerSaveBlocker.isStarted(this.blockerId)
      ) {
        return;
      }

      this.blockerId = powerSaveBlocker.start('prevent-app-suspension');
      this.logger.debug(
        `[AgentPowerSaveBlockerService] Started power save blocker: ${this.blockerId}`,
      );
      return;
    }

    this.releaseBlocker();
  }

  private releaseBlocker(): void {
    if (this.blockerId === null) return;

    if (powerSaveBlocker.isStarted(this.blockerId)) {
      powerSaveBlocker.stop(this.blockerId);
      this.logger.debug(
        `[AgentPowerSaveBlockerService] Stopped power save blocker: ${this.blockerId}`,
      );
    }

    this.blockerId = null;
  }

  protected onTeardown(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.releaseBlocker();
  }
}
