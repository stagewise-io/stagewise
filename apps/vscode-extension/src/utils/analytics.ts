import * as vscode from 'vscode';
import { PostHog } from 'posthog-node';
import { createHash } from 'node:crypto';
import { EnvironmentInfo } from './environment-info';
import { VScodeContext } from './vscode-context';

// Initialize PostHog client
// Note: The API key should be your actual PostHog API key
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com';
const SALT = 'stagewise';

export const client = POSTHOG_API_KEY
  ? new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      disableGeoip: true,
    })
  : null;

function hashId(id: string): string {
  return createHash('sha256')
    .update(id + SALT)
    .digest('hex');
}

/**
 * Gets the extension version and toolbar version using EnvironmentInfo
 * @returns Object containing extension and toolbar versions
 */
async function getVersions() {
  const environmentInfo = await EnvironmentInfo.getInstance();
  return {
    extensionVersion: environmentInfo.getExtensionVersion(),
    toolbarVersion: environmentInfo.getToolbarInstalledVersion() || 'unknown',
  };
}

/**
 * Checks if analytics/telemetry is enabled in the extension settings
 * @returns boolean indicating if analytics is enabled
 */
export function isAnalyticsEnabled(): boolean {
  const config = vscode.workspace.getConfiguration('stagewise');
  return config.get<boolean>('telemetry.enabled', true);
}

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

  TOOLBAR_AUTO_UPDATE_PROMPT_SENT = 'toolbar_auto_update_prompt_sent',
}

/**
 * Tracks an event using PostHog if analytics is enabled
 * @param eventName The name of the event to track
 * @param properties Optional properties to include with the event
 */
export async function trackEvent(
  eventName: EventName,
  properties?: Record<string, any>,
): Promise<void> {
  if (!isAnalyticsEnabled()) {
    return;
  }

  try {
    const machineId = vscode.env.machineId;
    const { extensionVersion, toolbarVersion } = await getVersions();
    const vscodeContext = await VScodeContext.getInstance();

    const eventData = {
      distinctId: hashId(machineId),
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

    await client?.capture(eventData);

    // Enhanced debug logging
    if (vscodeContext.isDevelopmentMode()) {
      console.log(
        '[Analytics] Event data:',
        JSON.stringify(eventData, null, 2),
      );
    }
  } catch (error) {
    const vscodeContext = await VScodeContext.getInstance();
    if (vscodeContext.isDevelopmentMode()) {
      console.error('[Analytics] Error sending event to PostHog:', error);
    }
  }
}

/**
 * Shuts down the PostHog client gracefully
 * Should be called when the extension is deactivated
 */
export async function shutdownAnalytics(): Promise<void> {
  await client?.shutdown();
}

/**
 * Special function to track telemetry state changes
 * This bypasses the normal isAnalyticsEnabled() check for the disable event
 * since we want to track when users opt-out before respecting their choice
 */
export async function trackTelemetryStateChange(
  enabled: boolean,
): Promise<void> {
  try {
    const machineId = vscode.env.machineId;
    const eventName = enabled ? 'telemetry_enabled' : 'telemetry_disabled';
    const { extensionVersion, toolbarVersion } = await getVersions();
    const vscodeContext = await VScodeContext.getInstance();

    const eventData = {
      distinctId: hashId(machineId),
      event: eventName,
      properties: {
        vscodeVersion: vscode.version,
        appName: vscode.env.appName,
        extensionVersion,
        toolbarVersion,
        platform: process.platform,
      },
    };

    await client?.capture(eventData);

    if (vscodeContext.isDevelopmentMode()) {
      console.log(
        '[Analytics] Telemetry state change event data:',
        JSON.stringify(eventData, null, 2),
      );
    }
  } catch (error) {
    const vscodeContext = await VScodeContext.getInstance();
    if (vscodeContext.isDevelopmentMode()) {
      console.error(
        '[Analytics] Error tracking telemetry state change:',
        error,
      );
    }
  }
}
