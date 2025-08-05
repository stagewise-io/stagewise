import * as args from './argparse';
import type { Config, ConfigFile } from './types';
import {
  loadConfigFile,
  saveConfigFile,
  configFileExists,
  CONFIG_FILE_NAME,
  type ConfigLoadError,
} from './config-file';
import { promptNumber, promptConfirm } from '../utils/user-input';
import { log, configureLogger } from '../utils/logger';
import { tokenManager } from '../auth/token-manager';
import { oauthManager } from '../auth/oauth';
import { analyticsEvents, telemetryManager } from '../utils/telemetry';

export class ConfigResolver {
  private config: Config | null = null;
  private authFlowInitiated = false;

  async resolveConfig(): Promise<Config> {
    // Configure logger first based on verbose flag
    configureLogger(args.verbose);

    // Bridge mode - still needs appPort for proxying
    if (args.bridgeMode) {
      log.debug('Starting in bridge mode');

      // Load config file if exists
      let configFile: ConfigFile | null = null;
      try {
        configFile = await loadConfigFile(args.workspace);
      } catch (error) {
        if (error && typeof error === 'object' && 'type' in error) {
          const configError = error as ConfigLoadError;
          log.error(configError.message);
          if (configError.details) {
            log.error(configError.details);
          }
          log.info(
            `\nPlease fix the errors in ${CONFIG_FILE_NAME} and try again.`,
          );
          process.exit(1);
        }
        throw error;
      }

      // In bridge mode, we still need appPort for proxying
      let appPort = args.appPort || configFile?.appPort;

      // Check if we need to prompt for missing appPort
      if (!appPort && !args.silent) {
        log.info('Bridge mode requires app port configuration.');

        appPort = await promptNumber({
          message: 'What port is your development app running on?',
          default: '3000',
        });
      } else if (!appPort) {
        throw new Error(
          'App port is required in bridge mode. Use --app-port flag or run in interactive mode.',
        );
      }

      // Save config for next time or ask user if no config exists
      if (!configFile && !args.silent) {
        const shouldSave = await promptConfirm({
          message: `Would you like to save this configuration to ${CONFIG_FILE_NAME}?`,
          default: true,
        });

        if (shouldSave) {
          await saveConfigFile(args.workspace, { appPort });
          log.info(`Configuration saved to ${CONFIG_FILE_NAME}`);

          // Track config storage event
          await analyticsEvents.storedConfigJson();
        }
      } else if (!configFile || configFile.appPort !== appPort) {
        await saveConfigFile(args.workspace, { appPort });
      }

      this.config = {
        port: args.port || 3100,
        appPort,
        dir: args.workspace,
        silent: args.silent,
        verbose: args.verbose,
        token: undefined,
        bridgeMode: true,
        autoPlugins: false, // Disabled in bridge mode
        plugins: [],
      };

      return this.config;
    }

    // Load config file if exists
    let configFile: ConfigFile | null = null;
    try {
      configFile = await loadConfigFile(args.workspace);
      if (configFile) {
        log.debug(`Loaded config from ${CONFIG_FILE_NAME}`);
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'type' in error) {
        const configError = error as ConfigLoadError;
        log.error(configError.message);
        if (configError.details) {
          log.error(configError.details);
        }
        log.info(
          `\nPlease fix the errors in ${CONFIG_FILE_NAME} and try again.`,
        );
        process.exit(1);
      }
      throw error;
    }

    // Merge configurations (CLI args override config file)
    const port = args.port || configFile?.port || 3100;
    let appPort = args.appPort || configFile?.appPort;
    const autoPlugins = configFile?.autoPlugins ?? true;
    const plugins = configFile?.plugins ?? [];

    // Check if we need to prompt for missing values
    if (!appPort && !args.silent) {
      appPort = await promptNumber({
        message: 'What port is your development app running on?',
        default: '3000',
      });
    } else if (!appPort) {
      throw new Error(
        'App port is required. Please provide it via --app-port argument or run without --silent flag.',
      );
    }

    // Validate port conflicts
    if (port === appPort) {
      throw new Error('Stagewise port and app port cannot be the same');
    }

    // Ask to save config if not exists and not silent
    if (!args.silent && !(await configFileExists(args.workspace))) {
      const shouldSave = await promptConfirm({
        message: `Would you like to save this configuration to ${CONFIG_FILE_NAME}?`,
        default: true,
      });

      if (shouldSave) {
        const configToSave: ConfigFile = {
          port,
          appPort,
          autoPlugins,
          plugins,
        };

        await saveConfigFile(args.workspace, configToSave);
        log.info(`Configuration saved to ${CONFIG_FILE_NAME}`);

        // Track config storage event
        await analyticsEvents.storedConfigJson();
      }
    }

    // Check if telemetry has been configured, if not prompt for opt-in (unless in silent mode)
    if (!(await telemetryManager.hasConfigured())) {
      if (!args.silent) {
        await telemetryManager.promptForOptIn();
      }
      // In silent mode, telemetry will use the default level (anonymous)
    }

    // Resolve authentication token
    let token: string | undefined;

    if (!args.bridgeMode) {
      // Check if token is provided via CLI argument
      if (args.token) {
        // Token provided via CLI argument, use it directly
        token = args.token;
        log.debug('Using token provided via command line');
      } else {
        // Try to get token from storage
        try {
          const storedToken = await tokenManager.getStoredToken();
          if (storedToken) {
            // Validate and refresh if needed
            token = await oauthManager.ensureValidAccessToken();
          } else if (!args.silent) {
            // No stored token and not silent, start OAuth flow
            log.info(
              'No authentication token found. Starting authorization process...',
            );
            this.authFlowInitiated = true;
            const tokenData = await oauthManager.initiateOAuthFlow(
              port,
              `http://localhost:${port}`,
              true,
            );
            token = tokenData.accessToken;
            // Give the auth server time to fully shut down
            await new Promise((resolve) => setTimeout(resolve, 500));
          } else {
            // No token and silent mode
            throw new Error(
              'Authentication token is required. Please provide it via --token argument or run without --silent flag.',
            );
          }
        } catch (error) {
          log.error(`Failed to ensure valid token: ${error}`);
          if (!args.silent) {
            log.info('Starting authorization process...');
            this.authFlowInitiated = true;
            const tokenData = await oauthManager.initiateOAuthFlow(
              port,
              `http://localhost:${port}`,
              true,
            );
            token = tokenData.accessToken;
            // Give the auth server time to fully shut down
            await new Promise((resolve) => setTimeout(resolve, 500));
          } else {
            throw new Error(
              'Authentication token is expired or invalid. Please run without --silent flag to re-authenticate.',
            );
          }
        }
      }
    }

    this.config = {
      port,
      appPort,
      dir: args.workspace,
      silent: args.silent,
      verbose: args.verbose,
      token,
      bridgeMode: args.bridgeMode,
      autoPlugins,
      plugins,
    };

    return this.config;
  }

  getConfig(): Config {
    if (!this.config) {
      throw new Error('Config not resolved yet. Call resolveConfig() first.');
    }
    return this.config;
  }

  wasAuthFlowInitiated(): boolean {
    return this.authFlowInitiated;
  }
}

export const configResolver = new ConfigResolver();
export default configResolver;
