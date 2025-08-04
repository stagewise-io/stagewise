import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import fs from 'node:fs';

// Mock the modules
vi.mock('node:fs');
vi.mock('commander');

// Mock process.argv and process.cwd
const originalArgv = process.argv;
const originalCwd = process.cwd;

// Helper function to create a mock Command instance
function createMockCommand(optsValue: any) {
  const mockParse = vi.fn();
  const mockOption = vi.fn().mockReturnThis();
  const mockName = vi.fn().mockReturnThis();
  const mockDescription = vi.fn().mockReturnThis();
  const mockVersion = vi.fn().mockReturnThis();
  const mockCommand = vi.fn().mockReturnThis();
  const mockAction = vi.fn().mockReturnThis();
  const mockOpts = vi.fn().mockReturnValue(optsValue);

  return {
    name: mockName,
    description: mockDescription,
    version: mockVersion,
    option: mockOption,
    parse: mockParse,
    command: mockCommand,
    action: mockAction,
    opts: mockOpts,
  } as any;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  process.argv = originalArgv;
  process.cwd = originalCwd;
});

describe('argparse', () => {
  describe('command line argument parsing', () => {
    it('should parse port argument correctly', async () => {
      process.argv = ['node', 'test.js', '-p', '4000'];
      const mockOpts = {
        port: 4000,
        workspace: process.cwd(),
        silent: false,
        verbose: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const { port } = await import('../../../src/config/argparse');
      expect(port).toBe(4000);
    });

    it('should parse app-port argument correctly', async () => {
      process.argv = ['node', 'test.js', '-a', '3000'];
      const mockOpts = {
        appPort: 3000,
        port: 3100,
        workspace: process.cwd(),
        silent: false,
        verbose: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const { appPort } = await import('../../../src/config/argparse');
      expect(appPort).toBe(3000);
    });

    it('should parse workspace argument correctly', async () => {
      const testDir = '/test/dir';
      process.argv = ['node', 'test.js', '-w', testDir];
      const mockOpts = {
        workspace: testDir,
        port: 3100,
        silent: false,
        verbose: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const { workspace } = await import('../../../src/config/argparse');
      expect(workspace).toBe(testDir);
    });

    it('should parse silent flag correctly', async () => {
      process.argv = ['node', 'test.js', '-s'];
      const mockOpts = {
        silent: true,
        port: 3100,
        workspace: process.cwd(),
        verbose: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const { silent } = await import('../../../src/config/argparse');
      expect(silent).toBe(true);
    });

    it('should parse verbose flag correctly', async () => {
      process.argv = ['node', 'test.js', '-v'];
      const mockOpts = {
        verbose: true,
        port: 3100,
        workspace: process.cwd(),
        silent: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const { verbose } = await import('../../../src/config/argparse');
      expect(verbose).toBe(true);
    });

    it('should parse token argument correctly', async () => {
      const testToken = 'test-token-123';
      process.argv = ['node', 'test.js', '-t', testToken];
      const mockOpts = {
        token: testToken,
        port: 3100,
        workspace: process.cwd(),
        silent: false,
        verbose: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const { token } = await import('../../../src/config/argparse');
      expect(token).toBe(testToken);
    });

    it('should parse bridge mode flag correctly', async () => {
      process.argv = ['node', 'test.js', '-b'];
      const mockOpts = {
        b: true,
        port: 3100,
        workspace: process.cwd(),
        silent: false,
        verbose: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const { bridgeMode } = await import('../../../src/config/argparse');
      expect(bridgeMode).toBe(true);
    });

    it('should use default values when no arguments provided', async () => {
      process.argv = ['node', 'test.js'];
      const mockOpts = {
        port: 3100,
        workspace: process.cwd(),
        silent: false,
        verbose: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const args = await import('../../../src/config/argparse');
      expect(args.port).toBe(3100);
      expect(args.workspace).toBe(process.cwd());
      expect(args.silent).toBe(false);
      expect(args.verbose).toBe(false);
      expect(args.bridgeMode).toBe(false);
      expect(args.appPort).toBeUndefined();
      expect(args.token).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('should not throw error when bridge mode is used with workspace argument', async () => {
      const testDir = '/test/workspace';
      process.argv = ['node', 'test.js', '-b', '-w', testDir];

      const mockOpts = {
        workspace: testDir,
        b: true,
        port: 3100,
        silent: false,
        verbose: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const { bridgeMode, workspace } = await import(
        '../../../src/config/argparse'
      );
      expect(bridgeMode).toBe(true);
      expect(workspace).toBe(testDir);
    });

    it('should throw error when bridge mode is used with token argument', async () => {
      process.argv = ['node', 'test.js', '-b', '-t', 'test-token'];

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Need to clear module cache and set up mocks before import
      vi.resetModules();

      // Mock Commander for this specific test
      vi.mocked(Command).mockImplementation(() => createMockCommand({}));

      await expect(
        () => import('../../../src/config/argparse'),
      ).rejects.toThrow('process.exit called');

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Bridge mode (-b) is incompatible with token (-t) configuration',
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
      mockConsoleError.mockRestore();
    });

    it('should throw error when port and app-port are the same', async () => {
      process.argv = ['node', 'test.js', '-p', '3000', '-a', '3000'];
      const mockOpts = {
        port: 3000,
        appPort: 3000,
        workspace: process.cwd(),
        silent: false,
        verbose: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));

      vi.mocked(fs.existsSync).mockReturnValue(true);

      await expect(
        () => import('../../../src/config/argparse'),
      ).rejects.toThrow('port and app-port cannot be the same');
    });

    it('should not throw error when port and app-port are different', async () => {
      process.argv = ['node', 'test.js', '-p', '3100', '-a', '3000'];
      const mockOpts = {
        port: 3100,
        appPort: 3000,
        workspace: process.cwd(),
        silent: false,
        verbose: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const args = await import('../../../src/config/argparse');
      expect(args.port).toBe(3100);
      expect(args.appPort).toBe(3000);
    });
  });

  describe('command wrapping with double-dash', () => {
    it('should detect wrapped command when double-dash is present', async () => {
      process.argv = ['node', 'test.js', '-p', '3100', '--', 'npm', 'run', 'build'];
      const mockOpts = {
        port: 3100,
        workspace: process.cwd(),
        silent: false,
        verbose: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const args = await import('../../../src/config/argparse');
      expect(args.hasWrappedCommand).toBe(true);
      expect(args.wrappedCommand).toEqual(['npm', 'run', 'build']);
      expect(args.port).toBe(3100);
    });

    it('should extract wrapped command correctly with complex arguments', async () => {
      process.argv = ['node', 'test.js', '-v', '--', 'tsx', 'build.ts', '--watch', '--config', 'custom.config.js'];
      const mockOpts = {
        verbose: true,
        workspace: process.cwd(),
        silent: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const args = await import('../../../src/config/argparse');
      expect(args.hasWrappedCommand).toBe(true);
      expect(args.wrappedCommand).toEqual(['tsx', 'build.ts', '--watch', '--config', 'custom.config.js']);
      expect(args.verbose).toBe(true);
    });

    it('should handle empty wrapped command after double-dash', async () => {
      process.argv = ['node', 'test.js', '-p', '3100', '--'];
      const mockOpts = {
        port: 3100,
        workspace: process.cwd(),
        silent: false,
        verbose: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const args = await import('../../../src/config/argparse');
      expect(args.hasWrappedCommand).toBe(true);
      expect(args.wrappedCommand).toEqual([]);
    });

    it('should not have wrapped command when no double-dash present', async () => {
      process.argv = ['node', 'test.js', '-p', '3100', 'npm', 'run', 'build'];
      const mockOpts = {
        port: 3100,
        workspace: process.cwd(),
        silent: false,
        verbose: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const args = await import('../../../src/config/argparse');
      expect(args.hasWrappedCommand).toBe(false);
      expect(args.wrappedCommand).toEqual([]);
    });

    it('should handle double-dash at the beginning', async () => {
      process.argv = ['node', 'test.js', '--', 'echo', 'hello'];
      const mockOpts = {
        workspace: process.cwd(),
        silent: false,
        verbose: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const args = await import('../../../src/config/argparse');
      expect(args.hasWrappedCommand).toBe(true);
      expect(args.wrappedCommand).toEqual(['echo', 'hello']);
    });

    it('should handle wrapped command with bridge mode flag before double-dash', async () => {
      process.argv = ['node', 'test.js', '-b', '--', 'npm', 'test'];
      const mockOpts = {
        b: true,
        workspace: process.cwd(),
        silent: false,
        verbose: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const args = await import('../../../src/config/argparse');
      expect(args.hasWrappedCommand).toBe(true);
      expect(args.wrappedCommand).toEqual(['npm', 'test']);
      expect(args.bridgeMode).toBe(true);
    });

    it('should correctly parse stagewise flags before double-dash and ignore command args after', async () => {
      process.argv = ['node', 'test.js', '-p', '4000', '-v', '--', 'node', 'script.js', '-p', '5000'];
      const mockOpts = {
        port: 4000,
        verbose: true,
        workspace: process.cwd(),
        silent: false,
        b: false,
      };

      vi.mocked(Command).mockImplementation(() => createMockCommand(mockOpts));
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const args = await import('../../../src/config/argparse');
      expect(args.hasWrappedCommand).toBe(true);
      expect(args.wrappedCommand).toEqual(['node', 'script.js', '-p', '5000']);
      expect(args.port).toBe(4000); // Stagewise port, not the one in wrapped command
      expect(args.verbose).toBe(true);
    });
  });
});
