import { powerMonitor } from 'electron';
import { DisposableService } from './disposable';
import type { AgentManagerService } from './agent-manager';
import type { Logger } from './logger';

const EVENT_LOOP_CHECK_INTERVAL_MS = 10_000;
const EVENT_LOOP_STALL_THRESHOLD_MS = 45_000;

export class AgentRuntimeRecoveryService extends DisposableService {
  private eventLoopCheckInterval: ReturnType<typeof setInterval> | null = null;
  private lastEventLoopCheckAt = Date.now();
  private suspendedAt: number | null = null;
  private readonly removeListeners: Array<() => void> = [];

  private constructor(
    private readonly logger: Logger,
    private readonly agentManager: AgentManagerService,
  ) {
    super();
  }

  public static create(
    logger: Logger,
    agentManager: AgentManagerService,
  ): AgentRuntimeRecoveryService {
    const instance = new AgentRuntimeRecoveryService(logger, agentManager);
    instance.initialize();
    return instance;
  }

  private recoverInterruptedActiveAgents(
    reason: 'system-resumed' | 'event-loop-stalled',
    details?: { stalledForMs?: number },
  ): void {
    void this.agentManager
      .recoverInterruptedActiveAgents(reason, details)
      .catch((error) => {
        this.logger.warn(
          `[AgentRuntimeRecoveryService] Failed to recover interrupted agents. reason=${reason}`,
          error,
        );
      });
  }

  private retryNetworkFailedAgents(reason: string): void {
    void this.agentManager
      .retryNetworkFailedAgentsNow(reason)
      .catch((error) => {
        this.logger.warn(
          `[AgentRuntimeRecoveryService] Failed to retry network-failed agents. reason=${reason}`,
          error,
        );
      });
  }

  private initialize(): void {
    const handleSuspend = () => {
      this.suspendedAt = Date.now();
      this.logger.info('[AgentRuntimeRecoveryService] System suspend detected');
    };

    const handleResume = () => {
      const now = Date.now();
      const suspendedForMs =
        this.suspendedAt === null ? undefined : now - this.suspendedAt;
      this.suspendedAt = null;
      this.lastEventLoopCheckAt = now;

      this.logger.info(
        `[AgentRuntimeRecoveryService] System resume detected${
          suspendedForMs === undefined
            ? ''
            : ` after ${Math.round(suspendedForMs / 1000)}s`
        }`,
      );

      this.recoverInterruptedActiveAgents('system-resumed', {
        stalledForMs: suspendedForMs,
      });
      this.retryNetworkFailedAgents('system-resumed');
    };

    powerMonitor.on('suspend', handleSuspend);
    powerMonitor.on('resume', handleResume);
    this.removeListeners.push(() => {
      powerMonitor.off('suspend', handleSuspend);
      powerMonitor.off('resume', handleResume);
    });

    this.eventLoopCheckInterval = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - this.lastEventLoopCheckAt;
      this.lastEventLoopCheckAt = now;

      if (elapsedMs < EVENT_LOOP_STALL_THRESHOLD_MS) return;

      this.logger.info(
        `[AgentRuntimeRecoveryService] Event loop stall detected. elapsedMs=${elapsedMs}`,
      );

      this.recoverInterruptedActiveAgents('event-loop-stalled', {
        stalledForMs: elapsedMs,
      });
      this.retryNetworkFailedAgents('event-loop-stalled');
    }, EVENT_LOOP_CHECK_INTERVAL_MS);
    this.eventLoopCheckInterval.unref?.();
  }

  protected onTeardown(): void {
    for (const removeListener of this.removeListeners.splice(0)) {
      removeListener();
    }

    if (this.eventLoopCheckInterval) {
      clearInterval(this.eventLoopCheckInterval);
      this.eventLoopCheckInterval = null;
    }
  }
}
