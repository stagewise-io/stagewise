import * as vscode from 'vscode';
import { PostHog } from 'posthog-node';
import { createHash } from 'node:crypto';
import { EnvironmentInfo } from './environment-info';
import { VScodeContext } from './vscode-context';

// Note: The API key should be your actual PostHog API key
const SALT = 'stagewise';

export enum EventName {
  EXTENSION_ACTIVATED = 'extension_activated',
  ACTIVATION_ERROR = 'activation_error',

  OPENED_WEB_APP_WORKSPACE = 'opened_web_app_workspace',

  GETTING_STARTED_PANEL_SHOWN = 'getting_started_panel_shown',
  GETTING_STARTED_PANEL_MANUAL_SHOW = 'getting_started_panel_manual_show',
  INTERACTED_WITH_GETTING_STARTED_PANEL = 'interacted_with_getting_started_panel',
  DISMISSED_GETTING_STARTED_PANEL = 'dismissed_getting_started_panel',
  CLICKED_SETUP_TOOLBAR_IN_GETTING_STARTED_PANEL = 'clicked_setup_toolbar_in_getting_started_panel',
  CLICKED_OPEN_DOCS_IN_GETTING_STARTED_PANEL = 'clicked_open_docs_in_getting_started_panel',

  POST_SETUP_FEEDBACK = 'post_setup_feedback',

  TOOLBAR_AUTO_SETUP_STARTED = 'toolbar_auto_setup_started',

  TOOLBAR_CONNECTED = 'toolbar_connected',

  AGENT_PROMPT_TRIGGERED = 'agent_prompt_triggered',

  SHOW_TOOLBAR_UPDATE_NOTIFICATION = 'show_toolbar_update_notification',
  TOOLBAR_UPDATE_NOTIFICATION_AUTO_UPDATE = 'toolbar_update_notification_auto_update',
  TOOLBAR_UPDATE_NOTIFICATION_IGNORED = 'toolbar_update_notification_ignored',
  TOOLBAR_UPDATE_NOTIFICATION_DISMISSED = 'toolbar_update_notification_dismissed',

  SHOW_TOOLBAR_INTEGRATION_NOTIFICATION = 'show_toolbar_integration_notification',
  TOOLBAR_INTEGRATION_NOTIFICATION_IGNORE = 'toolbar_integration_notification_ignore',
  TOOLBAR_INTEGRATION_NOTIFICATION_DISMISSED = 'toolbar_integration_notification_dismissed',

  TOOLBAR_AUTO_UPDATE_PROMPT_SENT = 'toolbar_auto_update_prompt_sent',
}

export class AnalyticsService {
  private static instance: AnalyticsService;
  private context = VScodeContext.getInstance();

  private client: PostHog | null = null;

  private constructor() {
    // private constructor to enforce singleton pattern
  }

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  public initialize(): void {
    const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
    const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com';

    if (POSTHOG_API_KEY) {
      console.log('[AnalyticsService] Initializing client');
      this.client = new PostHog(POSTHOG_API_KEY, {
        host: POSTHOG_HOST,
        disableGeoip: true,
      });
    } else {
      console.log('[AnalyticsService] No API key found');
    }
  }

  private hashId(id: string): string {
    return createHash('sha256')
      .update(id + SALT)
      .digest('hex');
  }

  private async getVersions() {
    const environmentInfo = EnvironmentInfo.getInstance();
    return {
      extensionVersion: environmentInfo.getExtensionVersion(),
      toolbarVersion: environmentInfo.getToolbarInstalledVersion() || 'unknown',
    };
  }

  private isAnalyticsEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('stagewise');
    return config.get<boolean>('telemetry.enabled', true);
  }

  public async trackEvent(
    eventName: EventName,
    properties?: Record<string, any>,
  ): Promise<void> {
    if (!this.isAnalyticsEnabled()) {
      return;
    }

    console.log('[Analytics] Tracking event:', eventName);

    try {
      const machineId = vscode.env.machineId;
      const { extensionVersion, toolbarVersion } = await this.getVersions();

      const eventData = {
        distinctId: this.hashId(machineId),
        event: eventName,
        properties: {
          ...properties,
          vscodeVersion: vscode.version,
          appName: vscode.env.appName,
          extensionVersion,
          toolbarVersion,
          platform: process.platform,
        },
      };

      if (this.client) {
        await this.client.capture(eventData);
      }

      // Enhanced debug logging
      if (this.context.isDevelopmentMode()) {
        console.log(
          '[Analytics] Event data:',
          JSON.stringify(eventData, null, 2),
        );
      }
    } catch (error) {
      if (this.context.isDevelopmentMode()) {
        console.error('[Analytics] Error sending event to PostHog:', error);
      }
    }
  }

  public shutdown(): Promise<void> {
    return this.client?.shutdown() ?? Promise.resolve();
  }

  public trackTelemetryStateChange(enabled: boolean): void {
    if (!this.client) {
      return;
    }
    this.performTrackTelemetryStateChange(enabled);
  }

  private async performTrackTelemetryStateChange(
    enabled: boolean,
  ): Promise<void> {
    try {
      const machineId = vscode.env.machineId;
      const eventName = enabled ? 'telemetry_enabled' : 'telemetry_disabled';
      const { extensionVersion, toolbarVersion } = await this.getVersions();

      const eventData = {
        distinctId: this.hashId(machineId),
        event: eventName,
        properties: {
          vscodeVersion: vscode.version,
          appName: vscode.env.appName,
          extensionVersion,
          toolbarVersion,
          platform: process.platform,
        },
      };

      await this.client?.capture(eventData);

      if (this.context.isDevelopmentMode()) {
        console.log(
          '[Analytics] Telemetry state change event data:',
          JSON.stringify(eventData, null, 2),
        );
      }
    } catch (error) {
      if (this.context.isDevelopmentMode()) {
        console.error(
          '[Analytics] Error tracking telemetry state change:',
          error,
        );
      }
    }
  }
}
