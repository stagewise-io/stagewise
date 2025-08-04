import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { CommandExecutor } from '../../src/utils/command-executor';

// Mock the logger to avoid test output noise
vi.mock('../../src/utils/logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Command Wrapping Integration Tests', () => {
  let commandExecutor: CommandExecutor;

  beforeEach(() => {
    commandExecutor = new CommandExecutor();
  });

  afterEach(async () => {
    await commandExecutor.shutdown();
  });

  describe('CommandExecutor', () => {
    it('should execute simple command successfully', async () => {
      const result = await commandExecutor.executeCommand(['echo', 'hello world']);
      expect(result.exitCode).toBe(0);
    });

    it('should handle command with arguments', async () => {
      const result = await commandExecutor.executeCommand(['node', '-e', 'console.log("test")']);
      expect(result.exitCode).toBe(0);
    });

    it('should return correct exit code for failing command', async () => {
      const result = await commandExecutor.executeCommand(['node', '-e', 'process.exit(42)']);
      expect(result.exitCode).toBe(42);
    });

    it('should handle nonexistent command', async () => {
      await expect(
        commandExecutor.executeCommand(['nonexistent-command-12345'])
      ).rejects.toThrow();
    });

    it('should handle empty command array', async () => {
      await expect(
        commandExecutor.executeCommand([])
      ).rejects.toThrow('No command provided');
    });

    it('should be able to shutdown gracefully', async () => {
      // Start a long-running command
      const resultPromise = commandExecutor.executeCommand(['node', '-e', 'setTimeout(() => {}, 10000)']);
      
      // Wait a bit then shutdown
      setTimeout(async () => {
        await commandExecutor.shutdown();
      }, 100);

      const result = await resultPromise;
      // The command should be terminated, so exit code will be non-zero
      expect(result.exitCode).not.toBe(0);
    });

    it('should track running status correctly', async () => {
      expect(commandExecutor.isRunning()).toBe(false);

      // Start a command that takes some time
      const resultPromise = commandExecutor.executeCommand(['node', '-e', 'setTimeout(() => {}, 500)']);
      
      // Should be running now
      expect(commandExecutor.isRunning()).toBe(true);

      await resultPromise;
      
      // Should not be running anymore
      expect(commandExecutor.isRunning()).toBe(false);
    });

    it('should handle commands with special characters in arguments', async () => {
      const result = await commandExecutor.executeCommand([
        'node', 
        '-e', 
        'console.log(process.argv[2])', 
        'hello & echo "injected"'
      ]);
      expect(result.exitCode).toBe(0);
    });

    it('should handle multiple sequential commands', async () => {
      const result1 = await commandExecutor.executeCommand(['echo', 'first']);
      expect(result1.exitCode).toBe(0);

      const result2 = await commandExecutor.executeCommand(['echo', 'second']);
      expect(result2.exitCode).toBe(0);

      const result3 = await commandExecutor.executeCommand(['node', '-e', 'process.exit(3)']);
      expect(result3.exitCode).toBe(3);
    });
  });

  describe('Signal Handling', () => {
    // Note: These tests are more complex to implement in a test environment
    // as they involve process signals. For now, we test the basic structure.
    
    it('should setup signal handlers without throwing', () => {
      expect(() => {
        const executor = new CommandExecutor();
        // The constructor should set up signal handlers without issues
      }).not.toThrow();
    });
  });

  describe('Platform Compatibility', () => {
    it('should handle cross-platform command execution', async () => {
      // Use a command that works on all platforms
      const command = process.platform === 'win32' ? 'echo' : 'echo';
      const args = ['test-message'];
      
      const result = await commandExecutor.executeCommand([command, ...args]);
      expect(result.exitCode).toBe(0);
    });
  });
});