import { spawn, type ChildProcess } from 'node:child_process';
import { log } from './logger';

export interface CommandExecutionResult {
  exitCode: number;
  signal?: string;
}

export class CommandExecutor {
  private childProcess: ChildProcess | null = null;
  private isShuttingDown = false;
  private signalHandlers: Map<NodeJS.Signals, () => void> = new Map();

  async executeCommand(
    commandParts: string[],
  ): Promise<CommandExecutionResult> {
    if (commandParts.length === 0) {
      throw new Error('No command provided');
    }

    const [command, ...args] = commandParts;

    if (!command) {
      throw new Error('No command provided');
    }

    log.debug(`Executing proxy command: ${command} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      try {
        // Spawn the child process
        this.childProcess = spawn(command, args, {
          stdio: 'inherit', // Forward stdin, stdout, stderr to parent
          shell: process.platform === 'win32', // Use shell on Windows
        });

        const childProcess = this.childProcess;

        // Handle process exit
        childProcess.on('exit', (code, signal) => {
          log.debug(
            `Proxy command exited with code: ${code}, signal: ${signal || 'none'}`,
          );
          this.childProcess = null;
          this.cleanupSignalHandlers();

          if (signal) {
            resolve({ exitCode: code || 1, signal });
          } else {
            resolve({ exitCode: code || 0 });
          }
        });

        // Handle process errors
        childProcess.on('error', (error) => {
          log.error(`Failed to execute proxy command: ${error.message}`);
          this.childProcess = null;
          this.cleanupSignalHandlers();
          reject(error);
        });

        // Forward signals to child process
        this.setupSignalHandling();
      } catch (error) {
        reject(error);
      }
    });
  }

  private setupSignalHandling(): void {
    if (!this.childProcess) return;

    // Clean up any existing handlers first
    this.cleanupSignalHandlers();

    const forwardSignal = (signal: NodeJS.Signals) => {
      return () => {
        if (
          this.childProcess &&
          !this.isShuttingDown &&
          !this.childProcess.killed
        ) {
          log.debug(`Forwarding ${signal} to proxy command`);
          this.childProcess.kill(signal);
        }
      };
    };

    // Register handlers and store references
    const sigintHandler = forwardSignal('SIGINT');
    const sigtermHandler = forwardSignal('SIGTERM');

    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigtermHandler);

    this.signalHandlers.set('SIGINT', sigintHandler);
    this.signalHandlers.set('SIGTERM', sigtermHandler);

    // Handle Windows signals
    if (process.platform === 'win32') {
      const sigbreakHandler = forwardSignal('SIGTERM');
      process.on('SIGBREAK', sigbreakHandler);
      this.signalHandlers.set('SIGBREAK', sigbreakHandler);
    }
  }

  private cleanupSignalHandlers(): void {
    for (const [signal, handler] of this.signalHandlers) {
      process.off(signal, handler);
    }
    this.signalHandlers.clear();
  }

  async shutdown(): Promise<void> {
    if (!this.childProcess || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    log.debug('Shutting down proxy command');

    return new Promise((resolve) => {
      if (!this.childProcess) {
        this.cleanupSignalHandlers();
        resolve();
        return;
      }

      // Set up timeout for forceful termination
      const timeout = setTimeout(() => {
        if (this.childProcess && !this.childProcess.killed) {
          log.debug('Force killing proxy command');
          this.childProcess.kill('SIGKILL');
        }
      }, 5000);

      // Listen for child process exit
      this.childProcess.on('exit', () => {
        clearTimeout(timeout);
        this.childProcess = null;
        this.cleanupSignalHandlers();
        resolve();
      });

      // Try graceful shutdown first
      if (!this.childProcess.killed) {
        this.childProcess.kill('SIGTERM');
      }
    });
  }

  isRunning(): boolean {
    return this.childProcess !== null && !this.childProcess.killed;
  }
}

// Export a singleton instance for global use
export const commandExecutor = new CommandExecutor();
