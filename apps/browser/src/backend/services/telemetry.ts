import { PostHog } from 'posthog-node';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { withTracing } from '@posthog/ai';
import type { IdentifierService } from './identifier';
import type { PreferencesService } from './preferences';
import type { TelemetryLevel } from '@shared/karton-contracts/ui/shared-types';
import type { Logger } from './logger';
import { DisposableService } from './disposable';

export type EventProperties = {
  // Lifecycle
  'app-launched': { cold_start: boolean };
  'app-closed': undefined;
  'telemetry-level-changed': { from: TelemetryLevel; to: TelemetryLevel };
  'onboarding-completed': {
    skipped: boolean;
    suggestion_id?: string;
    telemetry_level: TelemetryLevel;
  };

  // Workspace
  'workspace-mounted': { agent_type: string };
  'workspace-unmounted': { agent_type: string };

  // Agent
  'agent-created': { agent_type: string; model_id: string };
  'agent-message-sent': {
    agent_type: string;
    model_id: string;
    has_attachments: boolean;
    attachment_count: number;
  };
  'agent-step-completed': {
    agent_type: string;
    model_id: string;
    provider_mode: string;
    input_tokens: number;
    output_tokens: number;
    tool_call_count: number;
    finish_reason: string;
    duration_ms: number;
  };
  'agent-stopped': { agent_type: string };
  'agent-resumed': { agent_type: string };
  'agent-deleted': { agent_type: string };
  'agent-model-changed': {
    agent_type: string;
    from_model: string;
    to_model: string;
  };

  // Tools
  'tool-approved': { tool_name: string };
  'tool-denied': { tool_name: string; reason?: string };
  'tool-call-executed': {
    tool_name: string;
    agent_type: string;
    model_id: string;
    success: boolean;
    error_message?: string;
    input_keys?: string[];
    input_summary?: string;
    duration_ms?: number;
  };

  // Edits
  'edits-accepted': { hunk_count: number };
  'edits-rejected': { hunk_count: number };

  // Suggestions
  'suggestion-clicked': {
    suggestion_id: string;
    context: 'onboarding' | 'empty-chat';
  };

  // Usage limits
  'usage-limit-reached': {
    agent_type: string;
    model_id: string;
    provider_mode: string;
    window_types: string[];
    first_window_resets_at: string;
    exceeded_window_count: number;
  };
  'usage-warning-shown': {
    agent_type: string;
    model_id: string;
    provider_mode: string;
    window_type: string;
    used_percent: number;
    resets_at: string;
  };

  // UI (routed via karton RPC)
  'ui-interaction': { action: string; target: string; detail?: string };
};

export interface UserProperties {
  user_id?: string;
  user_email?: string;
}

export type ExceptionProperties = {
  service?: string;
} & Record<string, unknown>;

export class TelemetryService extends DisposableService {
  private readonly identifierService: IdentifierService;
  private readonly preferencesService: PreferencesService;
  private readonly logger: Logger;
  private userProperties: UserProperties = {};
  public posthogClient: PostHog;

  public constructor(
    identifierService: IdentifierService,
    preferencesService: PreferencesService,
    logger: Logger,
  ) {
    super();
    this.identifierService = identifierService;
    this.preferencesService = preferencesService;
    this.logger = logger;
    const apiKey = process.env.POSTHOG_API_KEY ?? '';
    this.posthogClient = new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
      disabled: !apiKey,
    });

    this.identifyUser();

    this.preferencesService.addListener((newPrefs, oldPrefs) => {
      if (newPrefs.privacy.telemetryLevel !== oldPrefs.privacy.telemetryLevel) {
        this.capture('telemetry-level-changed', {
          from: oldPrefs.privacy.telemetryLevel,
          to: newPrefs.privacy.telemetryLevel,
        });
      }
    });

    logger.debug('[TelemetryService] Telemetry initialized');
  }

  /**
   * Get the current telemetry level from preferences.
   */
  public get telemetryLevel(): TelemetryLevel {
    return this.preferencesService.get().privacy.telemetryLevel;
  }

  private getTelemetryLevel(): TelemetryLevel {
    return this.telemetryLevel;
  }

  setUserProperties(properties: UserProperties): void {
    this.userProperties = { ...this.userProperties, ...properties };
  }

  private getDistinctId(): string {
    return this.getTelemetryLevel() === 'full' && this.userProperties.user_id
      ? this.userProperties.user_id
      : this.identifierService.getMachineId();
  }

  identifyUser() {
    if (
      this.userProperties.user_id &&
      this.userProperties.user_email &&
      this.getTelemetryLevel() === 'full'
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
    model: LanguageModelV3,
    properties?: Parameters<typeof withTracing>[2],
  ): LanguageModelV3 {
    const telemetryLevel = this.getTelemetryLevel();
    if (telemetryLevel !== 'full') return model;

    const distinctId = this.getDistinctId();

    const wrappedModel = withTracing(model, this.posthogClient, {
      posthogDistinctId: distinctId,
      ...properties,
      posthogProperties: {
        product: 'stagewise-browser',
        telemetry_level: telemetryLevel,
        app_version: __APP_VERSION__,
        app_release_channel: __APP_RELEASE_CHANNEL__,
        app_platform: __APP_PLATFORM__,
        app_arch: __APP_ARCH__,
        ...properties?.posthogProperties,
      },
    });

    // Fix for AI SDK v6: PostHog's withTracing uses spread which doesn't copy
    // prototype getters like 'supportedUrls'. This property is required by the
    // AI SDK to determine which URL schemes the model supports for file uploads.
    // Without it, Object.entries(undefined) throws during asset download.
    if ('supportedUrls' in model && !('supportedUrls' in wrappedModel)) {
      Object.defineProperty(wrappedModel, 'supportedUrls', {
        get: () => model.supportedUrls,
        enumerable: true,
        configurable: true,
      });
    }

    return wrappedModel;
  }

  public capture<T extends keyof EventProperties>(
    eventName: T,
    properties?: EventProperties[T],
  ): void {
    try {
      this.logger.debug(
        `[TelemetryService] Capturing event: ${eventName} with properties: ${JSON.stringify(properties)}`,
      );
      const telemetryLevel = this.getTelemetryLevel();

      // Always allow critical lifecycle events through so we can measure
      // opt-out rates and keep funnels intact even when telemetry is off.
      const bypassOptOut: Array<keyof EventProperties> = [
        'telemetry-level-changed',
        'onboarding-completed',
      ];
      if (telemetryLevel === 'off' && !bypassOptOut.includes(eventName)) return;

      if (!this.posthogClient) return;

      const distinctId = this.getDistinctId();

      const finalProperties = {
        ...(typeof properties === 'object' ? properties : {}),
        product: 'stagewise-browser',
        telemetry_level: telemetryLevel,
        app_version: __APP_VERSION__,
        app_release_channel: __APP_RELEASE_CHANNEL__,
        app_platform: __APP_PLATFORM__,
        app_arch: __APP_ARCH__,
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
    properties?: ExceptionProperties,
  ): void {
    try {
      const telemetryLevel = this.getTelemetryLevel();
      if (telemetryLevel === 'off') return;

      this.logger.debug(
        `[TelemetryService] Capturing exception: ${error.message}`,
      );

      const distinctId = this.getDistinctId();
      this.posthogClient.captureException(error, distinctId, {
        properties: {
          ...properties,
          product: 'stagewise-browser',
          telemetry_level: telemetryLevel,
          app_version: __APP_VERSION__,
          app_release_channel: __APP_RELEASE_CHANNEL__,
          app_platform: __APP_PLATFORM__,
          app_arch: __APP_ARCH__,
        },
      });
    } catch (err) {
      this.logger.error(`[TELEMETRY] Failed to capture exception: ${err}`);
    }
  }

  protected report(error: Error): void {
    this.captureException(error, {
      service: this.constructor.name,
    });
  }

  protected async onTeardown(): Promise<void> {
    this.logger.debug('[TelemetryService] Tearing down...');
    if (this.posthogClient) {
      try {
        this.capture('app-closed', undefined);
        await this.posthogClient.shutdown();
      } catch (error) {
        this.logger.debug(`Failed to shutdown PostHog: ${error}`);
      }
    }
    this.logger.debug('[TelemetryService] Teardown complete');
  }
}
