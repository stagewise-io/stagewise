import { readConfigFile, writeConfigFile } from './config-path';
import { PostHog } from 'posthog-node';
import { identifierManager } from './identifier';
import { log } from './logger';
import { promptConfirm } from './user-input';
import chalk from 'chalk';

export type TelemetryLevel = 'off' | 'anonymous' | 'full';

export interface TelemetryConfig {
  level: TelemetryLevel;
}

export interface EventProperties {
  [key: string]: any;
}

export interface UserProperties {
  user_id?: string;
  user_email?: string;
}

export interface CliStartProperties {
  mode: 'bridge' | 'regular';
  workspace_configured_manually: boolean;
  auto_plugins_enabled: boolean;
  manual_plugins_count: number;
  has_wrapped_command: boolean;
}

const TELEMETRY_CONFIG_FILE = 'telemetry.json';
const DEFAULT_TELEMETRY_LEVEL: TelemetryLevel = 'anonymous';

export class TelemetryManager {
  private static instance: TelemetryManager;
  private config: TelemetryConfig | null = null;
  private posthogClient: PostHog | null = null;
  private initialized = false;
  private userProperties: UserProperties = {};

  private constructor() {}

  static getInstance(): TelemetryManager {
    if (!TelemetryManager.instance) {
      TelemetryManager.instance = new TelemetryManager();
    }
    return TelemetryManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const apiKey = process.env.POSTHOG_API_KEY;
    if (!apiKey) {
      log.debug('POSTHOG_API_KEY not found, analytics disabled');
      return;
    }

    try {
      this.posthogClient = new PostHog(apiKey, {
        host: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
        flushAt: 1,
        flushInterval: 0,
      });

      this.initialized = true;

      // Use machineId consistently as the distinctId to avoid creating multiple persons
      const machineId = await identifierManager.getMachineId();

      if (
        this.userProperties.user_id &&
        this.userProperties.user_email &&
        (await this.getLevel()) === 'full'
      ) {
        this.posthogClient.identify({
          distinctId: this.userProperties.user_id,
          properties: {
            email: this.userProperties.user_email,
          },
        });
        this.posthogClient.alias({
          distinctId: this.userProperties.user_id,
          alias: machineId,
        });
      }

      log.debug('PostHog analytics initialized');
    } catch (error) {
      log.debug(`Failed to initialize PostHog: ${error}`);
    }
  }

  async getLevel(): Promise<TelemetryLevel> {
    if (!this.config) {
      await this.loadConfig();
    }
    return this.config?.level || DEFAULT_TELEMETRY_LEVEL;
  }

  async setLevel(level: TelemetryLevel): Promise<void> {
    this.config = { level };
    await writeConfigFile(TELEMETRY_CONFIG_FILE, this.config);
  }

  async getStatus(): Promise<TelemetryConfig> {
    if (!this.config) {
      await this.loadConfig();
    }
    return this.config || { level: DEFAULT_TELEMETRY_LEVEL };
  }

  async hasConfigured(): Promise<boolean> {
    const config = await readConfigFile<TelemetryConfig>(TELEMETRY_CONFIG_FILE);
    return config !== null;
  }

  async isEnabled(): Promise<boolean> {
    const level = await this.getLevel();
    return level !== 'off';
  }

  async isFullTelemetryEnabled(): Promise<boolean> {
    const level = await this.getLevel();
    return level === 'full';
  }

  setUserProperties(properties: UserProperties): void {
    this.userProperties = { ...this.userProperties, ...properties };
  }

  async capture(
    eventName: string,
    properties?: EventProperties,
  ): Promise<void> {
    try {
      // Initialize PostHog if not already initialized
      await this.initialize();

      const telemetryLevel = await this.getLevel();

      // Special case: always send telemetry config events even when turning off
      const isConfigEvent = eventName === 'cli-telemetry-config-set';

      // Skip non-config events when telemetry is off or PostHog client is not available
      if (!isConfigEvent && (telemetryLevel === 'off' || !this.posthogClient)) {
        return;
      }

      // If PostHog client is not available (e.g., no API key), skip all events
      if (!this.posthogClient) {
        return;
      }

      const machineId = await identifierManager.getMachineId();

      const finalProperties: EventProperties = {
        ...properties,
        telemetry_level: telemetryLevel,
      };

      this.posthogClient.capture({
        distinctId: machineId, // Consistently use machineId as distinctId
        event: eventName,
        properties: finalProperties,
      });
    } catch (error) {
      log.debug(`[TELEMETRY] Failed to capture analytics event: ${error}`);
    }
  }

  async shutdown(): Promise<void> {
    if (this.posthogClient) {
      try {
        await this.posthogClient.shutdown();
        log.debug('PostHog analytics shut down');
      } catch (error) {
        log.debug(`Failed to shutdown PostHog: ${error}`);
      }
    }
  }

  async telemetryConfigSet(
    level: TelemetryLevel,
    triggeredBy: 'cli-prompt' | 'command' = 'command',
  ): Promise<void> {
    log.debug(`[TELEMETRY] Telemetry config set to ${level}`);
    await this.capture('cli-telemetry-config-set', {
      configured_level: level,
      triggered_by: triggeredBy,
    });
  }

  async cliStart(properties: CliStartProperties): Promise<void> {
    log.debug(`[TELEMETRY] CLI started ${JSON.stringify(properties)}`);
    await this.capture('cli-start', properties);
  }

  async storedConfigJson(): Promise<void> {
    log.debug('[TELEMETRY] Config JSON stored');
    await this.capture('cli-stored-config-json');
  }

  async foundConfigJson(): Promise<void> {
    log.debug('[TELEMETRY] Found config JSON');
    await this.capture('cli-found-config-json');
  }

  async sendPrompt(): Promise<void> {
    log.debug('[TELEMETRY] Sending prompt');
    await this.capture('cli-send-prompt');
  }

  async cliShutdown(): Promise<void> {
    log.debug('[TELEMETRY] CLI shutdown');
    await this.capture('cli-shutdown');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async cliAuthInitiated(initiatedAutomatically: boolean): Promise<void> {
    log.debug(
      `[TELEMETRY] CLI auth initiated - automatic: ${initiatedAutomatically}`,
    );
    await this.capture('cli-auth-initiated', {
      initiated_automatically: initiatedAutomatically,
    });
  }

  async cliAuthCompleted(initiatedAutomatically: boolean): Promise<void> {
    log.debug(
      `[TELEMETRY] CLI auth completed - automatic: ${initiatedAutomatically}`,
    );
    await this.capture('cli-auth-completed', {
      initiated_automatically: initiatedAutomatically,
    });
  }

  async promptForOptIn(): Promise<void> {
    console.log(`\n${chalk.cyan('📊 Telemetry Configuration')}`);
    console.log(
      '\nStagewise collects telemetry data to help improve the product.',
    );
    console.log(
      'This data helps us understand how the CLI is used and identify issues.\n',
    );

    const acceptFull = await promptConfirm({
      message: 'Would you like to share usage data to help improve Stagewise?',
      default: true,
      hint: 'This includes your user ID and email if authenticated. Declining will collect pseudonymized data instead.',
    });

    let level: TelemetryLevel;

    if (acceptFull) {
      level = 'full';
      console.log(
        chalk.green('\n✓ Thank you! Telemetry has been set to "full".'),
      );
    } else {
      level = 'anonymous';
      console.log(
        chalk.green(
          '\n✓ Telemetry has been set to "anonymous" (pseudonymized data only).',
        ),
      );
      console.log(
        chalk.gray(
          '  To disable data collection completely, run: stagewise telemetry set off',
        ),
      );
    }

    // Initialize PostHog if needed to send the configuration event
    await this.initialize();

    // Save the configuration
    await this.setLevel(level);

    // Track the configuration event
    await this.telemetryConfigSet(level, 'cli-prompt');

    console.log(
      chalk.gray(
        "\nYou can update telemetry preferences by calling 'stagewise telemetry set'.\n",
      ),
    );
  }

  private async loadConfig(): Promise<void> {
    const config = await readConfigFile<TelemetryConfig>(TELEMETRY_CONFIG_FILE);
    if (config && this.isValidTelemetryLevel(config.level)) {
      this.config = config;
    } else {
      this.config = { level: DEFAULT_TELEMETRY_LEVEL };
    }
  }

  private isValidTelemetryLevel(level: unknown): level is TelemetryLevel {
    return (
      typeof level === 'string' && ['off', 'anonymous', 'full'].includes(level)
    );
  }
}

export const telemetryManager = TelemetryManager.getInstance();

export async function getTelemetryLevel() {
  return telemetryManager.getLevel();
}

export async function isTelemetryEnabled() {
  return telemetryManager.isEnabled();
}

export async function isFullTelemetryEnabled() {
  return telemetryManager.isFullTelemetryEnabled();
}

export const analyticsEvents = {
  telemetryConfigSet: (
    level: TelemetryLevel,
    triggeredBy: 'cli-prompt' | 'command' = 'command',
  ) => telemetryManager.telemetryConfigSet(level, triggeredBy),
  cliStart: (properties: CliStartProperties) =>
    telemetryManager.cliStart(properties),
  storedConfigJson: () => telemetryManager.storedConfigJson(),
  foundConfigJson: () => telemetryManager.foundConfigJson(),
  sendPrompt: () => telemetryManager.sendPrompt(),
  cliShutdown: () => telemetryManager.cliShutdown(),
  cliAuthInitiated: (initiatedAutomatically: boolean) =>
    telemetryManager.cliAuthInitiated(initiatedAutomatically),
  cliAuthCompleted: (initiatedAutomatically: boolean) =>
    telemetryManager.cliAuthCompleted(initiatedAutomatically),
};
