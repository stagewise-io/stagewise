import { configResolver } from './config';
import { configFileExists } from './config/config-file';
import { telemetryManager, analyticsEvents } from './utils/telemetry';
import { identifierManager } from './utils/identifier';
import { UnifiedServer } from './server/unified-server';
import { log } from './utils/logger';
import {
  silent,
  commandExecuted,
  authSubcommand,
  telemetrySubcommand,
  telemetryLevel,
  wrappedCommand,
  hasWrappedCommand,
} from './config/argparse';
import { printBanner } from './utils/banner';
import { oauthManager } from './auth/oauth';
import {
  discoverDependencies,
  getDependencyList,
} from './dependency-parser/index.js';
import open from 'open';
import { commandExecutor } from './utils/command-executor';
import { startupBanner } from './utils/startup-banner.js';
import { WorkspaceManager } from './workspace/workspace-manager.js';

// Suppress util._extend deprecation warnings
const originalStderr = process.stderr.write;
process.stderr.write = function (chunk: any, encoding?: any, callback?: any) {
  const str = chunk.toString();
  if (str.includes('DEP0060') && str.includes('util._extend')) {
    return true;
  }
  return originalStderr.call(this, chunk, encoding, callback);
};

async function main() {
  try {
    // Handle auth commands (these still work via CLI for initial setup)
    if (commandExecuted === 'auth') {
      switch (authSubcommand) {
        case 'status': {
          const authState = await oauthManager.checkAuthStatus();
          if (!authState.isAuthenticated) {
            log.info('Not authenticated. Use the UI to authenticate.');
            process.exit(1);
          }
          log.info(`Authenticated as: ${authState.userEmail}`);
          return;
        }
        case 'logout': {
          const logoutState = await oauthManager.getAuthState();
          if (!logoutState || !logoutState.isAuthenticated) {
            log.info('Already logged out.');
            return;
          }
          log.info('Logging out...');
          await oauthManager.logout();
          log.info('Successfully logged out.');
          return;
        }
        case 'login': {
          log.info('Please use the UI to authenticate. The auth flow is now integrated into the main server.');
          log.info('Start the server and authenticate through the browser interface.');
          return;
        }
      }
      return;
    }

    // Handle telemetry commands
    if (commandExecuted === 'telemetry') {
      if (!telemetrySubcommand) {
        log.error('Please specify a telemetry subcommand: opt-in or opt-out');
        process.exit(1);
      }

      switch (telemetrySubcommand) {
        case 'opt-in':
          await telemetryManager.optIn();
          log.info('Telemetry enabled. Thank you for helping improve Stagewise!');
          break;
        case 'opt-out':
          await telemetryManager.optOut();
          log.info('Telemetry disabled.');
          break;
        default:
          if (telemetryLevel) {
            await telemetryManager.setLevel(telemetryLevel);
            log.info(`Telemetry level set to: ${telemetryLevel}`);
          } else {
            log.error(`Unknown telemetry subcommand: ${telemetrySubcommand}`);
            process.exit(1);
          }
      }
      return;
    }

    // Print banner if not silent
    if (!silent) {
      printBanner();
    }

    // Resolve configuration
    const config = await configResolver.resolveConfig();

    // Initialize machine ID
    await identifierManager.getMachineId();

    // Set user properties if authenticated
    const authState = await oauthManager.getAuthState();
    if (authState?.isAuthenticated) {
      telemetryManager.setUserProperties({
        user_id: authState.userId,
        user_email: authState.userEmail,
      });
    }

    // Initialize analytics
    await telemetryManager.initialize();

    // Track CLI start
    const hasConfigFile = await configFileExists(config.dir);
    await analyticsEvents.cliStart({
      mode: config.bridgeMode ? 'bridge' : 'regular',
      workspace_configured_manually: !hasConfigFile,
      auto_plugins_enabled: config.autoPlugins,
      manual_plugins_count: config.plugins.length,
      has_wrapped_command: hasWrappedCommand,
      eddy_mode: config.eddyMode,
    });

    if (hasConfigFile) {
      await analyticsEvents.foundConfigJson();
    }

    if (config.verbose) {
      log.debug('Configuration resolved:');
      log.debug(
        JSON.stringify(
          {
            ...config,
            token: config.token ? '[REDACTED]' : undefined,
          },
          null,
          2,
        ),
      );
    }

    // Log bridge mode status
    if (config.bridgeMode) {
      log.debug('Running in bridge mode - agent features disabled');
    }

    // Discover dependencies
    try {
      const dependencies = await discoverDependencies(config.dir);
      const dependencyList = getDependencyList(dependencies);

      if (dependencyList.length > 0 && config.verbose) {
        log.debug(
          `Discovered dependencies: ${dependencyList.slice(0, 10).join(', ')}${
            dependencyList.length > 10
              ? ` and ${dependencyList.length - 10} more...`
              : ''
          }`,
        );
      }
    } catch (error) {
      log.warn(
        `Failed to discover dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Create and initialize unified server
    const server = new UnifiedServer(config);
    await server.initialize();

    // Display startup banner if authenticated
    const workspaceManager = WorkspaceManager.getInstance();
    const workspace = workspaceManager.getCurrentWorkspace();
    
    if (!config.bridgeMode && authState?.isAuthenticated && workspace) {
      try {
        const subscription = await oauthManager.getSubscription();
        startupBanner({
          subscription,
          loadedPlugins: workspace.getPlugins(),
          email: authState?.userEmail || '',
          appPort: config.port,
          proxyPort: config.appPort,
        });
      } catch (error) {
        log.error(
          `Failed to display startup banner: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    // Start the server
    await server.start();

    // Open browser if not silent
    if (!silent) {
      const serverUrl = `http://localhost:${config.port}`;
      log.info(`Opening ${serverUrl} in your browser...`);
      await open(serverUrl);
    }

    // Execute wrapped command if provided
    if (wrappedCommand) {
      log.info(`Executing command: ${wrappedCommand}`);
      const exitCode = await commandExecutor.execute(wrappedCommand);
      if (exitCode !== 0) {
        log.error(`Command exited with code ${exitCode}`);
      }
      
      // Shutdown server after command completes
      await server.shutdown();
      process.exit(exitCode);
    }

    // Handle graceful shutdown
    const shutdown = async () => {
      log.info('Shutting down...');
      await analyticsEvents.cliStop();
      await server.shutdown();
      await workspaceManager.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    log.error(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (error instanceof Error && error.stack) {
      log.debug(error.stack);
    }
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});