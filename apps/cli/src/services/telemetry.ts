import { PostHog } from 'posthog-node';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import { withTracing } from '@posthog/ai';
import type { IdentifierService } from './identifier';
import type { GlobalConfigService } from './global-config';
import type {
  GlobalConfig,
  OpenFilesInIde,
} from '@stagewise/karton-contract/shared-types';
import type { Logger } from './logger';

export interface EventProperties {
  'cli-start': {
    mode: 'bridge' | 'regular';
    port?: number;
    portInArg?: boolean;
    executedCommand: string;
    workspace_path_in_arg: boolean; // Whether the workspace path was defined as an argument. Will only be true, if the user defined the path.
    auto_plugins_enabled: boolean; // Whether the auto plugins feature is enabled.
    manual_plugins_count: number; // The number of manually added plugins.
    has_wrapped_command: boolean; // Whether the wrapped command feature is enabled.
  };
  'workspace-opened': {
    initial_setup: boolean; // Whether the workspace was opened for the first time.
    auto_plugins_enabled: boolean; // Whether the auto plugins feature is enabled.
    manual_plugins_count: number; // The number of manually added plugins.
    loaded_plugins: string[]; // The plugins that were loaded.
    has_wrapped_command: boolean; // Whether the wrapped command feature is enabled.
    codebase_line_count?: number; // The number of lines of code in the workspace.
    dependency_count?: number; // The number of dependencies in the workspace.
    loading_method:
      | 'on_start'
      | 'on_start_with_arg'
      | 'at_runtime_by_user_action';
  };
  'workspace-with-child-workspaces-opened': {
    child_workspace_count: number; // Amount of workspace configs found (except for own if there's one).
    includes_itself: boolean; // If true, this means that there are child workspaces, but the opened path itself also has a config.
  };
  'workspace-setup-information-saved': {
    agent_access_path: string;
    app_port: number;
    ide?: OpenFilesInIde;
  };
  'cli-stored-config-json': undefined;
  'cli-found-config-json': undefined;
  'cli-send-prompt': undefined;
  'cli-credits-insufficient': {
    subscription_status: string;
    subscription_credits: number;
    subscription_credits_used: number;
    subscription_credits_remaining: number;
  };
  'cli-auth-initiated': {
    initiated_automatically: boolean;
  };
  'cli-auth-completed': {
    initiated_automatically: boolean;
  };
  'cli-telemetry-config-set': {
    configured_level: 'off' | 'anonymous' | 'full';
  };
  'agent-tool-call-completed': {
    chat_id: string;
    message_id: string;
    tool_name: string;
    success: boolean;
    error_message?: string;
    duration: number;
    tool_call_id: string;
  };
  'agent-undo-tool-calls': {
    chat_id: string;
    message_id: string;
    messages_undone_amount: {
      assistant: number;
      total: number;
    };
    tool_calls_undone_amount: Record<string, number>;
    type: 'restore-checkpoint' | 'undo-changes';
  };
  'agent-state-changed': {
    isWorking: boolean;
    wasWorking: boolean;
  };
  'agent-prompt-triggered': {
    snippetCount: number;
  };
  'agent-plan-limits-exceeded': {
    hasSubscription?: boolean;
    isPaidPlan?: boolean;
    cooldownMinutes?: number;
  };
  'agent-credits-insufficient': {
    hasSubscription?: boolean;
    creditsRemaining?: number;
  };
  'rag-updated': {
    index_progress: number;
    index_total: number;
  };
  'dev-app-started': {
    wrapped_command: string | null;
  };
  'dev-app-stopped': {
    wrapped_command: string | null;
  };
}

export interface UserProperties {
  user_id?: string;
  user_email?: string;
}

export class TelemetryService {
  private identifierService: IdentifierService;
  private globalConfigService: GlobalConfigService;
  private logger: Logger;
  private userProperties: UserProperties = {};
  public posthogClient: PostHog;

  public constructor(
    identifierService: IdentifierService,
    globalConfigService: GlobalConfigService,
    logger: Logger,
  ) {
    this.identifierService = identifierService;
    this.globalConfigService = globalConfigService;
    this.logger = logger;
    const apiKey = process.env.POSTHOG_API_KEY ?? '';
    this.posthogClient = new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
      disabled:
        this.globalConfigService.get().telemetryLevel === 'off' ||
        process.env.POSTHOG_API_KEY === undefined,
    });

    this.identifyUser();

    this.globalConfigService.addConfigUpdatedListener(
      (newConfig, oldConfig) => {
        this.onConfigUpdate(newConfig, oldConfig);
      },
    );

    logger.debug('[TelemetryService] Telemetry initialized');
  }

  setUserProperties(properties: UserProperties): void {
    this.userProperties = { ...this.userProperties, ...properties };
  }

  private getDistinctId(): string {
    return this.globalConfigService.get().telemetryLevel === 'full' &&
      this.userProperties.user_id
      ? this.userProperties.user_id
      : this.identifierService.getMachineId();
  }

  identifyUser() {
    if (
      this.userProperties.user_id &&
      this.userProperties.user_email &&
      this.globalConfigService.get().telemetryLevel === 'full'
    ) {
      this.logger.debug('[TelemetryService] Identifying user...');
      this.posthogClient.identify({
        distinctId: this.userProperties.user_id,
        properties: {
          email: this.userProperties.user_email,
        },
      });
      this.posthogClient.alias({
        alias: this.userProperties.user_id,
        distinctId: this.identifierService.getMachineId(),
      });
    } else {
      this.logger.debug(
        '[TelemetryService] Not identifying user, missing user properties or telemetry level is not "full"',
      );
    }
  }

  public withTracing(
    model: LanguageModelV2,
    properties?: Parameters<typeof withTracing>[2],
  ): LanguageModelV2 {
    const telemetryLevel = this.globalConfigService.get().telemetryLevel;
    if (telemetryLevel !== 'full') return model;

    const distinctId = this.getDistinctId();

    return withTracing(model, this.posthogClient, {
      posthogDistinctId: distinctId,
      ...properties,
      posthogProperties: {
        telemetry_level: telemetryLevel,
        cli_version: process.env.CLI_VERSION,
        ...properties?.posthogProperties,
      },
    });
  }

  public capture<T extends keyof EventProperties>(
    eventName: T,
    properties?: EventProperties[T],
  ): void {
    try {
      this.logger.debug(
        `[TelemetryService] Capturing event: ${eventName} with properties: ${JSON.stringify(properties)}`,
      );
      const telemetryLevel = this.globalConfigService.get().telemetryLevel;

      // Special case: always send telemetry config events even when turning off
      const isLevelConfigEvent = eventName === 'cli-telemetry-config-set';

      // Skip non-config events when telemetry is off or PostHog client is not available
      if (
        (!isLevelConfigEvent && telemetryLevel === 'off') ||
        !this.posthogClient
      ) {
        return;
      }

      const distinctId = this.getDistinctId();

      const finalProperties = {
        ...properties,
        telemetry_level: telemetryLevel,
        cli_version: process.env.CLI_VERSION,
      };

      this.posthogClient.capture({
        distinctId,
        event: eventName as string,
        properties: finalProperties,
      });
    } catch (error) {
      this.logger.error(
        `[TELEMETRY] Failed to capture analytics event: ${error}`,
      );
    }
  }

  public captureException(
    error: Error,
    properties?: Record<string, any>,
  ): void {
    const telemetryLevel = this.globalConfigService.get().telemetryLevel;
    if (telemetryLevel === 'off') return;
    const distinctId = this.getDistinctId();

    this.posthogClient.captureException(error, distinctId, {
      properties: {
        ...properties,
      },
    });
  }

  async shutdown(): Promise<void> {
    this.logger.debug('[TelemetryService] Shutting down...');
    if (this.posthogClient) {
      try {
        await this.posthogClient.shutdown();
      } catch (error) {
        this.logger.debug(`Failed to shutdown PostHog: ${error}`);
      }
    }
    this.logger.debug('[TelemetryService] Shutdown complete');
  }

  async onConfigUpdate(
    newConfig: GlobalConfig,
    oldConfig: GlobalConfig | null,
  ) {
    // If the new telemetry level is different from the current one, capture an event.
    if (newConfig.telemetryLevel !== oldConfig?.telemetryLevel) {
      this.logger.debug(
        `[TelemetryService] Detected change to telemetry level.`,
      );
      this.capture('cli-telemetry-config-set', {
        configured_level: newConfig.telemetryLevel,
      });
    }
  }
}
