import * as vscode from 'vscode';
import { PostHog } from 'posthog-node';
import { createHash } from 'node:crypto';

// Initialize PostHog client
// Note: The API key should be your actual PostHog API key
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com';
const SALT = 'stagewise';

export const client = new PostHog(POSTHOG_API_KEY, {
  host: POSTHOG_HOST,
  disableGeoip: true,
});

function hashId(id: string): string {
  return createHash('sha256')
    .update(id + SALT)
    .digest('hex');
}

/**
 * Checks if analytics/telemetry is enabled in the extension settings
 * @returns boolean indicating if analytics is enabled
 */
export function isAnalyticsEnabled(): boolean {
  const config = vscode.workspace.getConfiguration('stagewise');
  return config.get<boolean>('telemetry.enabled', true);
}

/**
 * Tracks an event using PostHog if analytics is enabled
 * @param eventName The name of the event to track
 * @param properties Optional properties to include with the event
 */
export async function trackEvent(
  eventName: string,
  properties?: Record<string, any>,
): Promise<void> {
  if (!isAnalyticsEnabled()) {
    return;
  }

  try {
    // Get a unique identifier for the user
    // Using a machine-specific ID that's anonymized
    const machineId = vscode.env.machineId;

    await client.capture({
      distinctId: hashId(machineId),
      event: eventName,
      properties: {
        ...properties,
        vscodeVersion: vscode.version,
        extensionVersion: vscode.extensions.getExtension(
          'stagewise.stagewise-vscode-extension',
        )?.packageJSON.version,
        platform: process.platform,
      },
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[Analytics] Event sent to PostHog: ${eventName}`,
        properties || {},
      );
    }
  } catch (error) {
    // Log error in development, but don't throw to avoid disrupting the user experience
    if (process.env.NODE_ENV === 'development') {
      console.error('[Analytics] Error sending event to PostHog:', error);
    }
  }
}

/**
 * Shuts down the PostHog client gracefully
 * Should be called when the extension is deactivated
 */
export async function shutdownAnalytics(): Promise<void> {
  await client.shutdown();
}
