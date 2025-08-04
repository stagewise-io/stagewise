import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { CommandExecutor } from '../../../src/utils/command-executor';

// Mock child_process
vi.mock('node:child_process');

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Create a mock child process
function createMockChildProcess() {
  const mockProcess = new EventEmitter();
  (mockProcess as any).kill = vi.fn();
  (mockProcess as any).killed = false;
  return mockProcess;
}

describe('CommandExecutor Unit Tests', () => {
  let commandExecutor: CommandExecutor;
  let mockChildProcess: any;

  beforeEach(() => {
    commandExecutor = new CommandExecutor();
    mockChildProcess = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChildProcess);
  });

  afterEach(async () => {
    await commandExecutor.shutdown();
    vi.resetAllMocks();
  });

  describe('executeCommand', () => {
    it('should spawn command with correct arguments', async () => {
      const resultPromise = commandExecutor.executeCommand(['npm', 'run', 'build']);
      
      // Wait a tick for spawn to be called
      await new Promise(resolve => setImmediate(resolve));
      
      expect(spawn).toHaveBeenCalledWith('npm', ['run', 'build'], {
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });

      // Simulate successful exit
      mockChildProcess.emit('exit', 0, null);
      
      const result = await resultPromise;
      expect(result.exitCode).toBe(0);
    });

    it('should handle command exit with signal', async () => {
      const resultPromise = commandExecutor.executeCommand(['test-command']);
      
      // Simulate exit with signal
      mockChildProcess.emit('exit', null, 'SIGTERM');
      
      const result = await resultPromise;
      expect(result.exitCode).toBe(1);
      expect(result.signal).toBe('SIGTERM');
    });

    it('should handle command execution error', async () => {
      const resultPromise = commandExecutor.executeCommand(['invalid-command']);
      
      // Simulate spawn error
      const error = new Error('Command not found');
      mockChildProcess.emit('error', error);
      
      await expect(resultPromise).rejects.toThrow('Command not found');
    });

    it('should reject when no command provided', async () => {
      await expect(
        commandExecutor.executeCommand([])
      ).rejects.toThrow('No command provided');
    });

    it('should handle Windows shell mode', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const resultPromise = commandExecutor.executeCommand(['test']);
      
      expect(spawn).toHaveBeenCalledWith('test', [], {
        stdio: 'inherit',
        shell: true,
      });

      // Complete the mock command
      mockChildProcess.emit('exit', 0, null);
      await resultPromise;

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should handle non-Windows platforms', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const resultPromise = commandExecutor.executeCommand(['test']);
      
      expect(spawn).toHaveBeenCalledWith('test', [], {
        stdio: 'inherit',
        shell: false,
      });

      // Complete the mock command
      mockChildProcess.emit('exit', 0, null);
      await resultPromise;

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('isRunning', () => {
    it('should return false when no command is running', () => {
      expect(commandExecutor.isRunning()).toBe(false);
    });

    it('should return true when command is running', async () => {
      const resultPromise = commandExecutor.executeCommand(['test-command']);
      
      // Wait for spawn to be called
      await new Promise(resolve => setImmediate(resolve));
      
      expect(commandExecutor.isRunning()).toBe(true);

      // Finish the command
      mockChildProcess.emit('exit', 0, null);
      await resultPromise;
      
      expect(commandExecutor.isRunning()).toBe(false);
    });

    it('should return false when command is killed', async () => {
      const resultPromise = commandExecutor.executeCommand(['test-command']);
      
      // Wait for spawn to be called
      await new Promise(resolve => setImmediate(resolve));
      
      // Mark as killed
      mockChildProcess.killed = true;
      
      expect(commandExecutor.isRunning()).toBe(false);

      // Clean up
      mockChildProcess.emit('exit', 1, 'SIGTERM');
      await resultPromise;
    });
  });

  describe('shutdown', () => {
    it('should resolve immediately when no command is running', async () => {
      await expect(commandExecutor.shutdown()).resolves.toBeUndefined();
    });

    it('should kill running command on shutdown', async () => {
      const resultPromise = commandExecutor.executeCommand(['test-command']);
      
      // Wait for spawn to be called
      await new Promise(resolve => setImmediate(resolve));
      
      const shutdownPromise = commandExecutor.shutdown();
      
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
      
      // Simulate process exit
      mockChildProcess.emit('exit', 143, 'SIGTERM');
      
      await shutdownPromise;
      await resultPromise;
    });

    it('should force kill after timeout', async () => {
      const resultPromise = commandExecutor.executeCommand(['test-command']);
      
      // Wait for spawn to be called
      await new Promise(resolve => setImmediate(resolve));
      
      // Mock setTimeout to trigger immediately
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((callback: any) => {
        setImmediate(callback);
        return 123 as any;
      }) as any;
      
      const shutdownPromise = commandExecutor.shutdown();
      
      // Don't emit exit, so timeout triggers
      await new Promise(resolve => setImmediate(resolve));
      
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGKILL');
      
      // Now emit exit
      mockChildProcess.emit('exit', 137, 'SIGKILL');
      
      await shutdownPromise;
      await resultPromise;
      
      global.setTimeout = originalSetTimeout;
    });
  });

  describe('signal forwarding', () => {
    it('should set up signal handlers when command is running', async () => {
      const resultPromise = commandExecutor.executeCommand(['test']);
      
      // Wait for spawn to be called and signal handlers to be set up
      await new Promise(resolve => setImmediate(resolve));
      
      // Check that the setup method was called (indirectly by checking for child process)
      expect(commandExecutor.isRunning()).toBe(true);

      // Complete the mock command
      mockChildProcess.emit('exit', 0, null);
      await resultPromise;
    });
  });
});