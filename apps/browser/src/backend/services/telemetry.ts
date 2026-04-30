import { z } from 'zod';
import { PostHog } from 'posthog-node';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { withTracing } from '@posthog/ai';
import type { IdentifierService } from './identifier';
import type { PreferencesService } from './preferences';
import type { TelemetryLevel } from '@shared/karton-contracts/ui/shared-types';
import type { Logger } from './logger';
import { DisposableService } from './disposable';
import { captureProcessSnapshot } from './telemetry/process-snapshot';

export type EventProperties = {
  // Lifecycle
  'app-launched': {
    matched_process_counts: Record<string, number>;
    total_matched_processes: number;
  };
  'app-closed': {
    matched_process_counts: Record<string, number>;
    total_matched_processes: number;
  };
  'telemetry-level-changed': { from: TelemetryLevel; to: TelemetryLevel };
  'onboarding-completed': {
    skipped: boolean;
    suggestion_id?: string;
    telemetry_level: TelemetryLevel;
  };
  'onboarding-demo-slide-clicked': {
    slide_name: string;
  };

  // Workspace
  'workspace-mounted': { agent_type: string; agent_instance_id: string };
  'workspace-unmounted': { agent_type: string; agent_instance_id: string };

  // Agent
  'agent-created': {
    agent_type: string;
    agent_instance_id: string;
    model_id: string;
  };
  'agent-message-sent': {
    agent_type: string;
    agent_instance_id: string;
    model_id: string;
    has_attachments: boolean;
    attachment_count: number;
    slash_command_ids: string[];
    slash_command_count: number;
    connected_workspace_count: number;
    /**
     * True if this is the first user message in the chat (no prior user
     * messages existed before this one was sent).
     */
    is_new_chat: boolean;
    /**
     * Milliseconds since the most recent message (user or agent) in history,
     * measured at the moment this message is dispatched. Undefined when this
     * is the first message in the chat.
     */
    ms_since_last_message?: number;
    /**
     * Tool approval mode configured on the agent at the moment this message
     * is sent. `'alwaysAsk'` = prompt user for each tool call,
     * `'alwaysAllow'` = auto-approve every tool call.
     */
    tool_approval_mode: 'alwaysAsk' | 'alwaysAllow';
  };
  'agent-message-queued': {
    agent_type: string;
    agent_instance_id: string;
    model_id: string;
    queue_length_after: number;
  };
  'agent-queue-flushed': {
    agent_type: string;
    agent_instance_id: string;
    flushed_message_count: number;
  };
  'agent-step-completed': {
    agent_type: string;
    agent_instance_id: string;
    model_id: string;
    provider_mode: string;
    input_tokens: number;
    output_tokens: number;
    tool_call_count: number;
    finish_reason: string;
    duration_ms: number;
  };
  'agent-stopped': {
    agent_type: string;
    agent_instance_id: string;
    ms_since_last_user_message?: number;
    ms_since_last_agent_message?: number;
  };
  'agent-resumed': { agent_type: string; agent_instance_id: string };
  'agent-archived': { agent_type: string; agent_instance_id: string };
  'agent-deleted': { agent_type: string; agent_instance_id: string };
  'agent-model-changed': {
    agent_type: string;
    agent_instance_id: string;
    from_model: string;
    to_model: string;
  };

  // Tools
  //
  // All three lifecycle events carry `tool_call_id` (the approval's unique
  // identifier, equal to the tool-call id) so the request, response, and
  // any "always allow" shortcut can be linked downstream.
  'tool-approval-requested': {
    tool_name: string;
    agent_instance_id: string;
    tool_call_id: string;
  };
  'tool-approved': {
    tool_name: string;
    agent_instance_id: string;
    tool_call_id: string;
  };
  'tool-denied': {
    tool_name: string;
    reason?: string;
    agent_instance_id: string;
    tool_call_id: string;
  };
  /**
   * Fires whenever an agent's tool-approval mode actually changes.
   * Emitted from the backend (`AgentManager.setToolApprovalMode`) so the
   * single source of truth covers every UI surface. Skipped when the new
   * mode equals the current mode (no-op calls are not logged).
   *
   * `source` identifies the UI entry point:
   *   - `panel-combobox`: the persistent mode selector in the chat panel
   *     (`ToolApprovalSelect`). Deliberate, typically preemptive.
   *   - `inline-approval-button`: the "Always allow" button shown on an
   *     active approval request card. Impulsive, reactive to a specific
   *     tool call.
   * `unknown` is used when a caller didn't specify a source (e.g.
   *  programmatic agent-side updates, future call sites).
   */
  'tool-approval-mode-changed': {
    agent_instance_id: string;
    previous_mode: 'alwaysAsk' | 'alwaysAllow';
    new_mode: 'alwaysAsk' | 'alwaysAllow';
    source: 'panel-combobox' | 'inline-approval-button' | 'unknown';
    /**
     * When `source === 'inline-approval-button'`, the approval ID of the
     * request the user was responding to. Lets us correlate the mode
     * change with a specific `tool-approval-requested` event.
     */
    tool_call_id?: string;
    /** Tool name for `inline-approval-button`; absent otherwise. */
    tool_name?: string;
  };
  'tool-call-executed': {
    tool_name: string;
    agent_type: string;
    agent_instance_id: string;
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
  'diff-history-fanout-cap-hit': {
    tool_call_id: string;
    agent_instance_id: string;
    /**
     * Category bucket of the first dropped path. Derived from path
     * segments — deliberately coarse so the telemetry event cannot
     * leak usernames, repo names, or directory structure.
     */
    path_category:
      | 'node_modules'
      | 'build-output'
      | 'tooling-cache'
      | 'dotfile'
      | 'other';
    cap: number;
  };

  // Suggestions
  'suggestion-clicked': {
    suggestion_id: string;
    context: 'onboarding' | 'empty-chat';
  };
  'suggestion-dismissed': {
    suggestion_id: string;
    context: 'onboarding' | 'empty-chat';
  };

  // Usage limits
  'usage-limit-reached': {
    agent_type: string;
    model_id: string;
    provider_mode: string;
    plan: string;
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
  'upstream-overload': {
    agent_type: string;
    model_id: string;
    provider_mode: string;
    provider_name?: string;
    status_code?: number;
  };

  // UI actions (routed via karton RPC from the renderer)
  'devtools-opened': { tab_id?: string };
  'devtools-closed': { tab_id?: string };
  'tab-created': { tab_count_after: number };
  'tab-destroyed': { tab_count_after: number };
  'tabs-cleaned': { closed_count: number };
  'tab-color-scheme-changed': { new_value: 'system' | 'light' | 'dark' };
  'settings-opened': undefined;
  'account-page-viewed': undefined;
  'chat-sidebar-toggled': { new_value: 'open' | 'closed' };
  'chat-new-agent-clicked': {
    source: 'sidebar-top' | 'sidebar-active-agents' | 'hotkey';
  };
  'element-selection-started': undefined;
  'element-selection-stopped': { element_selected: boolean };
  'custom-model-add-started': undefined;
  'custom-model-add-finished': undefined;
  'custom-model-add-aborted': {
    had_validation_errors: boolean;
    any_field_touched: boolean;
  };
  'custom-provider-add-started': undefined;
  'custom-provider-add-finished': undefined;
  'custom-provider-add-aborted': {
    had_validation_errors: boolean;
    any_field_touched: boolean;
  };
  'workspace-connect-started': undefined;
  'workspace-connect-finished': undefined;
  'workspace-connect-aborted': {
    reason: 'picker-closed' | 'suggestions-dismissed';
  };
  'workspace-connect-failed': {
    source: 'picker' | 'recent-workspace';
  };
};

export const UI_TELEMETRY_EVENT_NAMES = [
  'account-page-viewed',
  'chat-new-agent-clicked',
  'chat-sidebar-toggled',
  'custom-model-add-aborted',
  'custom-model-add-finished',
  'custom-model-add-started',
  'custom-provider-add-aborted',
  'custom-provider-add-finished',
  'custom-provider-add-started',
  'element-selection-started',
  'element-selection-stopped',
  'onboarding-demo-slide-clicked',
  'settings-opened',
  'suggestion-clicked',
  'suggestion-dismissed',
  'tabs-cleaned',
  'tool-approval-always-allowed',
  'workspace-connect-aborted',
  'workspace-connect-failed',
  'workspace-connect-finished',
  'workspace-connect-started',
] as const satisfies ReadonlyArray<keyof EventProperties>;

export type UIEventName = (typeof UI_TELEMETRY_EVENT_NAMES)[number];
export type UIEventProperties = Pick<EventProperties, UIEventName>;

const UI_TELEMETRY_EVENT_SCHEMAS = {
  'account-page-viewed': z.undefined().optional(),
  'chat-new-agent-clicked': z.object({
    source: z.enum(['sidebar-top', 'sidebar-active-agents', 'hotkey']),
  }),
  'chat-sidebar-toggled': z.object({
    new_value: z.enum(['open', 'closed']),
  }),
  'custom-model-add-aborted': z.object({
    had_validation_errors: z.boolean(),
    any_field_touched: z.boolean(),
  }),
  'custom-model-add-finished': z.undefined().optional(),
  'custom-model-add-started': z.undefined().optional(),
  'custom-provider-add-aborted': z.object({
    had_validation_errors: z.boolean(),
    any_field_touched: z.boolean(),
  }),
  'custom-provider-add-finished': z.undefined().optional(),
  'custom-provider-add-started': z.undefined().optional(),
  'element-selection-started': z.undefined().optional(),
  'element-selection-stopped': z.object({
    element_selected: z.boolean(),
  }),
  'onboarding-demo-slide-clicked': z.object({
    slide_name: z.string(),
  }),
  'settings-opened': z.undefined().optional(),
  'suggestion-clicked': z.object({
    suggestion_id: z.string(),
    context: z.enum(['onboarding', 'empty-chat']),
  }),
  'suggestion-dismissed': z.object({
    suggestion_id: z.string(),
    context: z.enum(['onboarding', 'empty-chat']),
  }),
  'tabs-cleaned': z.object({
    closed_count: z.number(),
  }),
  'tool-approval-always-allowed': z.object({
    tool_name: z.string(),
    agent_instance_id: z.string(),
    tool_call_id: z.string(),
  }),
  'workspace-connect-aborted': z.object({
    reason: z.enum(['picker-closed', 'suggestions-dismissed']),
  }),
  'workspace-connect-failed': z.object({
    source: z.enum(['picker', 'recent-workspace']),
  }),
  'workspace-connect-finished': z.undefined().optional(),
  'workspace-connect-started': z.undefined().optional(),
} satisfies {
  [K in UIEventName]: z.ZodType<UIEventProperties[K]>;
};

export function isUIEventName(eventName: string): eventName is UIEventName {
  return (UI_TELEMETRY_EVENT_NAMES as readonly string[]).includes(eventName);
}

export function parseUIEventProperties<T extends UIEventName>(
  eventName: T,
  properties: unknown,
): UIEventProperties[T] | null {
  const result = UI_TELEMETRY_EVENT_SCHEMAS[eventName].safeParse(properties);
  return result.success ? (result.data as UIEventProperties[T]) : null;
}

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
  private pendingAppLaunchedCapture: Promise<void> | null = null;
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

  public captureAppLaunched(): void {
    this.pendingAppLaunchedCapture = captureProcessSnapshot()
      .then((launchProcessSnapshot) => {
        this.captureSync('app-launched', {
          matched_process_counts: launchProcessSnapshot.matched_process_counts,
          total_matched_processes: launchProcessSnapshot.total_matched,
        });
      })
      .finally(() => {
        this.pendingAppLaunchedCapture = null;
      });
  }

  public capture<T extends keyof EventProperties>(
    eventName: T,
    properties?: EventProperties[T],
  ): void {
    this.captureSync(eventName, properties);
  }

  private captureSync<T extends keyof EventProperties>(
    eventName: T,
    properties?: EventProperties[T],
  ): void {
    try {
      // Guard the stringify — `capture` runs on every tracked event
      // (including high-volume ones like tool-call-executed) and
      // JSON.stringify is not free. Skip it when debug is disabled.
      if (this.logger.isDebugEnabled) {
        this.logger.debug(
          `[TelemetryService] Capturing event: ${eventName} with properties: ${JSON.stringify(properties)}`,
        );
      }
      const telemetryLevel = this.getTelemetryLevel();

      // Always allow critical lifecycle events through so we can measure
      // opt-out rates and keep funnels intact even when telemetry is off.
      const bypassOptOut: Array<keyof EventProperties> = [
        'app-launched',
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
    this.captureExceptionSync(error, properties);
  }

  private captureExceptionSync(
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
        // Let the launch capture finish if it was about to, but never wait
        // more than 250 ms. The launch snapshot itself already has a 1.5 s
        // timeout, so an unbounded await here can push shutdown past the
        // Electron close budget and prevent PostHog from flushing.
        if (this.pendingAppLaunchedCapture) {
          await Promise.race([
            this.pendingAppLaunchedCapture,
            new Promise<void>((resolve) => setTimeout(resolve, 250)),
          ]);
        }

        // Use a short timeout on close — we would rather lose the snapshot
        // than add up to 1.5 s to window-close latency.
        const snapshot = await captureProcessSnapshot(500);
        // Bypass the microtask hop used by `capture()` so the event is
        // enqueued into the PostHog client BEFORE `shutdown()` starts
        // draining. Going through `queueMicrotask` here races shutdown and
        // can drop `app-closed` entirely.
        this.captureSync('app-closed', {
          matched_process_counts: snapshot.matched_process_counts,
          total_matched_processes: snapshot.total_matched,
        });
        await this.posthogClient.shutdown();
      } catch (error) {
        this.logger.debug(`Failed to shutdown PostHog: ${error}`);
      }
    }
    this.logger.debug('[TelemetryService] Teardown complete');
  }
}
