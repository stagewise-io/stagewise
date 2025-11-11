import type { Logger } from '@/services/logger';
import { type ChildProcess, spawn } from 'node:child_process';
import type { WorkspaceConfigService } from './config';
import type { WorkspaceConfig } from '@stagewise/karton-contract/shared-types';
import type { KartonService } from '@/services/karton';
import {
  checkPortHasContent,
  getProcessListeningPorts,
} from '@/utils/port-utils';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { TelemetryService } from '@/services/telemetry';

// Constants
const DEFAULT_PORT = 3000;
const PORT_CHECK_INTERVAL_MS = 2000;
const PROCESS_KILL_TIMEOUT_MS = 5000;

// Type definitions
type AppError = { message: string; code: number };

/**
 * Simplified service for managing the dev app state
 */
export class WorkspaceDevAppStateService {
  private readonly logger: Logger;
  private readonly telemetryService: TelemetryService;
  private readonly kartonService: KartonService;
  private readonly configService: WorkspaceConfigService;
  private readonly workspacePath: string;
  private readonly wrappedCommand: string | null;

  private childProcess: ChildProcess | null = null;
  private portCheckInterval: NodeJS.Timeout | null = null;
  private hasContentOnPort = false;
  private lastError: AppError | null = null;
  private isPassThroughMode = false;
  private childProcessOwnedPorts: number[] = [];
  private pidFilePath: string;
  private shutdownHandlersRegistered = false;
  private isShuttingDown = false;
  private isStoppingChild = false;

  private constructor(
    logger: Logger,
    telemetryService: TelemetryService,
    kartonService: KartonService,
    configService: WorkspaceConfigService,
    workspacePath: string,
    wrappedCommand?: string,
  ) {
    this.logger = logger;
    this.telemetryService = telemetryService;
    this.kartonService = kartonService;
    this.configService = configService;
    this.workspacePath = workspacePath;
    this.wrappedCommand = wrappedCommand || null;
    this.isPassThroughMode = Boolean(wrappedCommand);
    // Store PID file in workspace-specific location
    this.pidFilePath = path.join(workspacePath, '.stagewise', 'dev-app.pid');
  }

  public static async create(
    logger: Logger,
    telemetryService: TelemetryService,
    kartonService: KartonService,
    configService: WorkspaceConfigService,
    workspacePath: string,
    wrappedCommand?: string,
  ): Promise<WorkspaceDevAppStateService> {
    const instance = new WorkspaceDevAppStateService(
      logger,
      telemetryService,
      kartonService,
      configService,
      workspacePath,
      wrappedCommand,
    );
    await instance.initialize();
    return instance;
  }

  private async initialize(): Promise<void> {
    this.logger.debug(
      '[WorkspaceDevAppStateService] Initializing dev app state service',
    );

    // Clean up any orphan processes from previous runs
    await this.cleanupOrphanProcess();

    // Register shutdown handlers to clean up child processes
    this.registerShutdownHandlers();

    // Start monitoring port for content
    this.startPortMonitoring();

    // Auto-start wrapped commands
    if (this.wrappedCommand) {
      await this.startApp();
    }

    // Register RPC handlers
    this.registerRpcHandlers();

    // Listen for config changes
    this.configService.addConfigUpdatedListener(
      this.handleConfigChange.bind(this),
    );
    this.logger.debug(
      '[WorkspaceDevAppStateService] Dev app state service initialized',
    );
  }

  public get lastAppError(): AppError | null {
    return this.lastError;
  }

  public get contentAvailableOnPort(): boolean {
    return this.hasContentOnPort;
  }

  // Core app control methods
  public async startApp(): Promise<void> {
    if (this.childProcess) return;
    this.logger.debug('[WorkspaceDevAppStateService] Starting app');

    const command = this.wrappedCommand || this.getConfigCommand();
    if (!command) return;

    // Use configured port for starting the process
    const port = this.getConfigPort();

    // For non-wrapped commands, check if port is already in use
    if (!this.wrappedCommand) {
      const portInUse = await checkPortHasContent(port);
      if (portInUse) {
        this.logger.debug(`Port ${port} already in use by another process`);
        return;
      }
    }

    await this.spawnProcess(command, port);

    void this.telemetryService.capture('dev-app-started');
    this.logger.debug('[WorkspaceDevAppStateService] App started');
  }

  public async stopApp(): Promise<void> {
    if (!this.childProcess) return;
    this.logger.debug('[WorkspaceDevAppStateService] Stopping app');

    this.isStoppingChild = true;
    await this.killProcess(this.childProcess)
      .then(() => {
        this.isStoppingChild = false;
      })
      .catch(() => {
        this.isStoppingChild = false;
      });
    this.childProcess = null;
    this.childProcessOwnedPorts = [];
    this.lastError = null;
    this.isPassThroughMode = false;
    await this.removePidFile();
    this.updateKartonState();

    void this.telemetryService.capture('dev-app-stopped');

    this.logger.debug('[WorkspaceDevAppStateService] App stopped');
  }

  public async restartApp(): Promise<void> {
    await this.stopApp();
    await this.startApp();
  }

  // Process management
  private async spawnProcess(command: string, port: number): Promise<void> {
    this.logger.debug('[WorkspaceDevAppStateService] Spawning process');
    const isWindows = process.platform === 'win32';

    // Parse command for Unix systems, use as-is for Windows shell
    const [cmd, ...args] = isWindows ? [command] : command.split(/\s+/);

    this.childProcess = spawn(cmd!, args, {
      cwd: this.workspacePath,
      env: { ...process.env, PORT: port.toString() },
      shell: isWindows,
      stdio: this.isPassThroughMode ? 'inherit' : 'pipe',
      windowsHide: false,
      // On Unix systems, create a new process group so we can kill all children
      detached: !isWindows,
    });

    // Store the PID for cleanup in case of crash
    if (this.childProcess.pid) {
      await this.storePid(this.childProcess.pid);
    }

    // Mark pass-through as used (only for first execution)
    if (this.isPassThroughMode) {
      this.isPassThroughMode = false;
    }

    this.setupProcessHandlers();
    this.updateKartonState();
    this.logger.debug('[WorkspaceDevAppStateService] Process spawned');
  }

  private setupProcessHandlers(): void {
    if (!this.childProcess) return;
    this.logger.debug(
      '[WorkspaceDevAppStateService] Setting up process handlers',
    );

    // Handle stdio if not in pass-through mode
    if (this.childProcess.stdout) {
      this.childProcess.stdout.on('data', (data) => {
        this.logger.info(`[App]: ${data.toString().trim()}`);
      });
    }

    if (this.childProcess.stderr) {
      this.childProcess.stderr.on('data', (data) => {
        this.logger.error(`[App Error]: ${data.toString().trim()}`);
      });
    }

    // Handle process events
    this.childProcess.on('exit', (code, signal) => {
      if (code && code !== 0) {
        this.lastError = {
          message: `Process exited with code ${code}`,
          code,
        };
      }
      this.childProcess = null;
      this.childProcessOwnedPorts = [];
      this.removePidFile().catch(() => {}); // Clean up PID file
      this.updateKartonState();

      // If we're wrapping a dev command and the child exited on its own (not due to our own stop/shutdown),
      // forward the child's exit code (or signal-derived exit code) and terminate this process.
      if (
        this.wrappedCommand &&
        !this.isStoppingChild &&
        !this.isShuttingDown
      ) {
        const forwardedExitCode =
          typeof code === 'number'
            ? code
            : signal
              ? this.getExitCodeForSignal(signal)
              : 0;
        this.logger.info(
          `Wrapped child process exited; exiting with code ${forwardedExitCode}`,
        );
        process.exit(forwardedExitCode);
      }
    });

    this.childProcess.on('error', (err) => {
      this.lastError = { message: err.message, code: -1 };
      this.childProcess = null;
      this.childProcessOwnedPorts = [];
      this.removePidFile().catch(() => {}); // Clean up PID file
      this.updateKartonState();
    });
    this.logger.debug('[WorkspaceDevAppStateService] Process handlers set up');
  }

  private async killProcess(proc: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
      if (!proc || proc.killed) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        if (!proc.killed) {
          // For Unix systems with process groups, kill the entire group
          if (process.platform !== 'win32' && proc.pid) {
            try {
              // Negative PID kills the entire process group
              process.kill(-proc.pid, 'SIGKILL');
            } catch {
              proc.kill('SIGKILL');
            }
          } else {
            proc.kill('SIGKILL');
          }
        }
        resolve();
      }, PROCESS_KILL_TIMEOUT_MS);

      proc.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      // For Unix systems with process groups, kill the entire group
      if (process.platform !== 'win32' && proc.pid) {
        try {
          // Negative PID kills the entire process group
          process.kill(-proc.pid, 'SIGTERM');
        } catch {
          proc.kill('SIGTERM');
        }
      } else {
        proc.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
      }
    });
  }

  // Port monitoring
  private startPortMonitoring(): void {
    const checkPort = async () => {
      const previousHasContent = this.hasContentOnPort;
      const previousChildPorts = this.childProcessOwnedPorts;

      // Different checking strategy based on whether we have a child process
      if (this.childProcess?.pid) {
        // For child processes, find which port they're actually listening on
        const ports = await getProcessListeningPorts(this.childProcess.pid);

        if (ports.length > 0) {
          // Process is listening on at least one port
          // Take the first port (could be enhanced to find the "main" port)
          this.childProcessOwnedPorts = ports;
          this.hasContentOnPort = true;
        } else {
          // Process not listening on any port yet
          this.childProcessOwnedPorts = [];
          this.hasContentOnPort = false;
        }
      } else if (!this.wrappedCommand && !this.getConfigCommand()) {
        // Only check port content if no command is configured
        // (external app scenario)
        const configPort = this.getConfigPort();
        this.hasContentOnPort = await checkPortHasContent(configPort);
        this.childProcessOwnedPorts = [];
      } else {
        // If we have a command but no child process, port is not available
        this.hasContentOnPort = false;
        this.childProcessOwnedPorts = [];
      }

      if (
        previousHasContent !== this.hasContentOnPort ||
        previousChildPorts !== this.childProcessOwnedPorts
      ) {
        this.updateKartonState();
      }
    };

    checkPort(); // Initial check
    this.portCheckInterval = setInterval(checkPort, PORT_CHECK_INTERVAL_MS);
  }

  // Map signals to conventional Unix exit codes (128 + signal number)
  private getExitCodeForSignal(signal: NodeJS.Signals): number {
    switch (signal) {
      case 'SIGHUP':
        return 129;
      case 'SIGINT':
        return 130;
      case 'SIGQUIT':
        return 131;
      case 'SIGILL':
        return 132;
      case 'SIGTRAP':
        return 133;
      case 'SIGABRT':
        return 134;
      case 'SIGBUS':
        return 135;
      case 'SIGFPE':
        return 136;
      case 'SIGKILL':
        return 137;
      case 'SIGUSR1':
        return 138;
      case 'SIGSEGV':
        return 139;
      case 'SIGUSR2':
        return 140;
      case 'SIGPIPE':
        return 141;
      case 'SIGALRM':
        return 142;
      case 'SIGTERM':
        return 143;
      default:
        return 0;
    }
  }

  // Config management
  private getConfigCommand(): string | null {
    const config = this.configService.get();
    return config?.appExecutionCommand ?? null;
  }

  private getConfigPort(): number {
    const config = this.configService.get();
    return config?.appPort ?? DEFAULT_PORT;
  }

  public getPort(): number {
    // Return the actual port the child process is using if available,
    // otherwise return the configured port
    return this.childProcessOwnedPorts[0] ?? this.getConfigPort();
  }

  private async handleConfigChange(
    newConfig: WorkspaceConfig,
    oldConfig: WorkspaceConfig | null,
  ): Promise<void> {
    // Skip if using wrapped command or shutting down
    if (this.wrappedCommand || !this.childProcess || !oldConfig) return;

    const configChanged =
      oldConfig.appExecutionCommand !== newConfig.appExecutionCommand ||
      oldConfig.appPort !== newConfig.appPort;

    if (configChanged) {
      await this.stopApp();
      if (newConfig.appExecutionCommand) {
        await this.startApp();
      }
    }
  }

  // State synchronization
  private updateKartonState(): void {
    this.kartonService.setState((draft) => {
      if (draft.workspace) {
        draft.workspace.devAppStatus = {
          childProcessRunning: this.childProcess !== null,
          contentAvailableOnPort: this.hasContentOnPort,
          lastChildProcessError: this.lastError,
          wrappedCommand: this.wrappedCommand,
          childProcessPid: this.childProcess?.pid ?? null,
          childProcessOwnedPorts: this.childProcessOwnedPorts,
        };
      }
    });
  }

  // RPC handlers
  private registerRpcHandlers(): void {
    this.kartonService.registerServerProcedureHandler(
      'workspace.devAppState.start',
      () => this.startApp(),
    );

    this.kartonService.registerServerProcedureHandler(
      'workspace.devAppState.stop',
      () => this.stopApp(),
    );

    this.kartonService.registerServerProcedureHandler(
      'workspace.devAppState.restart',
      () => this.restartApp(),
    );
  }

  private removeServerProcedureHandlers(): void {
    this.kartonService.removeServerProcedureHandler(
      'workspace.devAppState.start',
    );
    this.kartonService.removeServerProcedureHandler(
      'workspace.devAppState.stop',
    );
    this.kartonService.removeServerProcedureHandler(
      'workspace.devAppState.restart',
    );
  }

  // PID file management for orphan process cleanup
  private async storePid(pid: number): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.pidFilePath), { recursive: true });
      await fs.writeFile(this.pidFilePath, pid.toString(), 'utf-8');
    } catch (error) {
      this.logger.warn('Failed to store PID file:', error);
    }
  }

  private async removePidFile(): Promise<void> {
    try {
      await fs.unlink(this.pidFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  private async cleanupOrphanProcess(): Promise<void> {
    try {
      const pidStr = await fs.readFile(this.pidFilePath, 'utf-8');
      const pid = Number.parseInt(pidStr.trim(), 10);

      if (!Number.isNaN(pid)) {
        this.logger.info(
          `Found orphan process PID: ${pid}, attempting cleanup...`,
        );

        try {
          // Check if process still exists
          process.kill(pid, 0); // Signal 0 just checks if process exists

          // Process exists, kill it
          if (process.platform !== 'win32') {
            // Kill the entire process group on Unix
            try {
              process.kill(-pid, 'SIGTERM');
              setTimeout(() => {
                try {
                  process.kill(-pid, 'SIGKILL');
                } catch {
                  // Process already dead
                }
              }, 1000);
            } catch {
              // Try killing just the process
              process.kill(pid, 'SIGTERM');
            }
          } else {
            // Windows
            process.kill(pid, 'SIGTERM');
          }

          this.logger.info('Orphan process cleaned up successfully');
        } catch {
          // Process doesn't exist, which is fine
          this.logger.debug('Orphan process no longer exists');
        }

        // Remove the PID file
        await this.removePidFile();
      }
    } catch {
      // No PID file or unable to read it, which is fine
    }
  }

  private registerShutdownHandlers(): void {
    if (this.shutdownHandlersRegistered) return;

    const cleanup = async () => {
      if (this.childProcess) {
        this.logger.info('Shutting down child process...');
        await this.stopApp();
      }
    };

    // Handle various shutdown signals
    const handleSignal = async (signal: NodeJS.Signals) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      await cleanup();
      // Exit with conventional codes for signals: 130 for SIGINT, 143 for SIGTERM
      const exitCode =
        signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 0;
      process.exit(exitCode);
    };

    process.on('SIGINT', () => {
      void handleSignal('SIGINT');
    });
    process.on('SIGTERM', () => {
      void handleSignal('SIGTERM');
    });
    // Also handle other common termination-related signals
    process.on('SIGQUIT', () => {
      void handleSignal('SIGQUIT');
    });
    process.on('SIGHUP', () => {
      void handleSignal('SIGHUP');
    });
    process.on('exit', () => {
      void cleanup();
    });

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', async (error) => {
      this.logger.error('Uncaught exception:', error);
      if (!this.isShuttingDown) {
        this.isShuttingDown = true;
        await cleanup();
      }
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      this.logger.error('Unhandled rejection:', reason);
      if (!this.isShuttingDown) {
        this.isShuttingDown = true;
        await cleanup();
      }
      process.exit(1);
    });

    this.shutdownHandlersRegistered = true;
  }

  // Cleanup
  public async teardown(): Promise<void> {
    if (this.portCheckInterval) {
      clearInterval(this.portCheckInterval);
    }

    if (this.childProcess) {
      await this.stopApp();
    }

    this.removeServerProcedureHandlers();
  }
}
