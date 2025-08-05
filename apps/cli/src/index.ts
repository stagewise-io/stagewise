import { configResolver } from './config';
import { configFileExists } from './config/config-file';
import { telemetryManager, analyticsEvents } from './utils/telemetry';
import { identifierManager } from './utils/identifier';
import { getServer } from './server';
import { shutdownAgent } from './server/agent-loader';
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

// Suppress util._extend deprecation warnings
// Set NODE_NO_DEPRECATION to suppress all deprecation warnings, then restore other warnings
const originalStderr = process.stderr.write;
process.stderr.write = function (chunk: any, encoding?: any, callback?: any) {
  const str = chunk.toString();
  // Suppress the specific util._extend deprecation warning
  if (str.includes('DEP0060') && str.includes('util._extend')) {
    // Don't write this warning to stderr
    return true;
  }
  // For all other output, use the original stderr.write
  return originalStderr.call(this, chunk, encoding, callback);
};

async function main() {
  try {
    // Import argparse to check command and options

    // Handle auth commands
    if (commandExecuted === 'auth') {
      switch (authSubcommand) {
        case 'login': {
          // Check if already logged in
          const loginState = await oauthManager.getAuthState();
          if (loginState?.isAuthenticated && loginState.userEmail) {
            log.info(`Already logged in as: ${loginState.userEmail}`);
            return; // Exit immediately
          }

          try {
            const port = 3100;
            const tokenData = await oauthManager.initiateOAuthFlow(
              port,
              undefined,
              false,
            );
            log.info(`Successfully authenticated as: ${tokenData.userEmail}`);
            // Give the auth server time to fully shut down
            await new Promise((resolve) => setTimeout(resolve, 500));
            process.exit(0); // Exit successfully
          } catch (_error) {
            // Authentication failed - error already logged by oauth manager
            process.exit(1);
          }
          break; // Although unreachable, satisfies linter
        }

        case 'logout': {
          // Check if already logged out
          const logoutState = await oauthManager.getAuthState();
          if (!logoutState || !logoutState.isAuthenticated) {
            log.info('Already logged out.');
            return; // Exit immediately
          }

          log.info('Logging out...');
          await oauthManager.logout();
          log.info('Successfully logged out.');
          return; // Exit immediately
        }

        case 'status': {
          const authState = await oauthManager.checkAuthStatus();
          if (!authState.isAuthenticated) {
            log.info('Not authenticated.');
            process.exit(1);
          }
          log.info(`Authenticated as: ${authState.userEmail}`);
          return; // Exit immediately
        }
      }
      // If we get here, an auth command was executed, so exit
      return;
    }

    // Handle telemetry commands
    if (commandExecuted === 'telemetry') {
      switch (telemetrySubcommand) {
        case 'status': {
          const status = await telemetryManager.getStatus();
          log.info(`Telemetry level: ${status.level}`);
          log.info('');
          log.info('Telemetry levels:');
          log.info('  - off: Disable telemetry completely');
          log.info('  - anonymous: Enable telemetry with pseudonymized ID');
          log.info('  - full: Enable telemetry with actual user ID');
          return;
        }

        case 'set': {
          if (!telemetryLevel) {
            log.error('No telemetry level specified');
            process.exit(1);
          }

          const validLevels = ['off', 'anonymous', 'full'];
          if (!validLevels.includes(telemetryLevel)) {
            log.error(`Invalid telemetry level: ${telemetryLevel}`);
            log.error(`Valid levels are: ${validLevels.join(', ')}`);
            process.exit(1);
          }

          await telemetryManager.setLevel(telemetryLevel as any);
          log.info(`Telemetry level set to: ${telemetryLevel}`);

          // Track telemetry configuration change
          await analyticsEvents.telemetryConfigSet(
            telemetryLevel as any,
            'command',
          );

          return;
        }
      }
      // If we get here, a telemetry command was executed, so exit
      return;
    }

    // Print welcome banner first (unless in silent mode)
    if (!silent) {
      printBanner(false);
    }

    // Resolve configuration (handles all input sources)
    const config = await configResolver.resolveConfig();

    // Initialize machine ID early to ensure it's generated on first start
    await identifierManager.getMachineId();

    // Set user properties if authenticated
    const authState = await oauthManager.getAuthState();
    if (authState?.isAuthenticated) {
      telemetryManager.setUserProperties({
        user_id: authState.userId,
        user_email: authState.userEmail,
      });
    }

    // Initialize analytics after config is resolved and opt-in handled
    await telemetryManager.initialize();

    // Track CLI start
    const hasConfigFile = await configFileExists(config.dir);

    await analyticsEvents.cliStart({
      mode: config.bridgeMode ? 'bridge' : 'regular',
      workspace_configured_manually: !hasConfigFile,
      auto_plugins_enabled: config.autoPlugins,
      manual_plugins_count: config.plugins.length,
      has_wrapped_command: hasWrappedCommand,
    });

    // Track if config file was found
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
      log.debug('Running in bridge mode - agent server disabled');
    }

    // Discover dependencies in the workspace directory
    try {
      const dependencies = await discoverDependencies(config.dir);
      const dependencyList = getDependencyList(dependencies);

      if (dependencyList.length > 0) {
        if (config.verbose) {
          log.debug(
            `Discovered dependencies: ${dependencyList.slice(0, 10).join(', ')}${
              dependencyList.length > 10
                ? ` and ${dependencyList.length - 10} more...`
                : ''
            }`,
          );
        }
      } else {
        log.debug('No dependencies found in current directory');
      }
    } catch (error) {
      log.warn(
        `Failed to discover dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    const { server } = await getServer();

    // Start the server listening
    server.listen(config.port);

    server.on('listening', async () => {
      const address = server.address();
      const port =
        typeof address === 'object' && address ? address.port : config.port;
      const serverUrl = `http://localhost:${port}`;

      log.info(`✓ Stagewise is running on ${serverUrl}`);
      if (config.appPort) {
        log.info(`✓ Proxying app from port ${config.appPort}`);
      }
      if (config.bridgeMode) {
        log.info('✓ Running in bridge mode (agent server disabled)');
      }

      // Open browser automatically unless in test environment or auth flow was initiated
      // (auth flow will redirect the existing browser window)
      if (
        process.env.NODE_ENV !== 'test' &&
        !configResolver.wasAuthFlowInitiated()
      ) {
        try {
          await open(serverUrl);
          log.info('✓ Opening browser...');
        } catch (_error) {
          log.debug('Failed to open browser automatically');
        }
      }
    });

    // Handle graceful shutdown
    const gracefulShutdown = async () => {
      log.info('\nShutting down...');

      // Prevent multiple shutdown attempts
      if ((global as any).isShuttingDown) {
        console.log('Already shutting down');
        return;
      }
      (global as any).isShuttingDown = true;

      // Track shutdown event
      try {
        await analyticsEvents.cliShutdown();

        // Shutdown telemetry
        await telemetryManager.shutdown();
      } catch (_error) {
        // Ignore analytics errors during shutdown
      }

      // Shutdown agent first
      shutdownAgent();
      // Force close all connections
      server.closeAllConnections();

      process.exit(0);
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);

    // Keep the process alive
    process.on('uncaughtException', (error) => {
      log.error(`Uncaught exception: ${error.message}`);
      log.debug(error.stack || '');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      log.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
      process.exit(1);
    });

    if (hasWrappedCommand && wrappedCommand.length > 0) {
      // Execute the wrapped command
      const result = await commandExecutor.executeCommand(wrappedCommand);
      process.exit(result.exitCode);
    }
  } catch (error) {
    if (error instanceof Error) {
      // Only log once using the logger if available
      try {
        log.error(error.message);
      } catch {
        // Logger might not be initialized, fall back to console
        console.error(error.message);
      }
    } else {
      console.error('An unknown error occurred');
    }
    process.exit(1);
  }
}

// Run the main function
main();
