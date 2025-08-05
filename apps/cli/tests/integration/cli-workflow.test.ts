import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let portOffset = 0;
function getTestPorts() {
  const basePort = 4100 + portOffset;
  const appPort = 4000 + portOffset;
  portOffset += 10;
  return { port: basePort, appPort };
}

async function killProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!child.killed) {
      child.on('exit', () => resolve());
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
        resolve();
      }, 1000);
    } else {
      resolve();
    }
  });
}

describe('CLI Workflow Integration Tests', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stagewise-test-'));
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
    // Wait a bit to ensure ports are released
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe('CLI arguments', () => {
    it('should start with default port when no port is specified', async () => {
      const child = spawn(
        'tsx',
        ['src/index.ts', '-a', '3000', '-w', testDir, '-s', '-t', 'test-token'],
        {
          cwd: process.cwd(),
          shell: false,
        },
      );

      let output = '';
      let errorOutput = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      // Wait a bit for the process to start
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check if the output contains the expected port
      if (errorOutput) {
        console.error('Test stderr:', errorOutput);
      }
      expect(output).toContain('3100'); // Default port when not specified

      await killProcess(child);
    });

    it('should fail when port and app-port are the same', async () => {
      const child = spawn(
        'tsx',
        ['src/index.ts', '-p', '3000', '-a', '3000', '-s'],
        {
          cwd: process.cwd(),
          shell: false,
        },
      );

      let errorOutput = '';
      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      const exitCode = await new Promise<number>((resolve) => {
        child.on('exit', (code) => resolve(code || 0));
      });

      expect(exitCode).not.toBe(0);
      expect(errorOutput).toContain('port and app-port cannot be the same');
    });

    it('should succeed in bridge mode with workspace argument', async () => {
      const child = spawn(
        'tsx',
        ['src/index.ts', '-b', '-w', testDir, '-a', '3000', '-p', '3101', '-s'],
        {
          cwd: process.cwd(),
          shell: false,
        },
      );

      let output = '';
      let errorOutput = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      // Wait a bit for the process to start
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Should start successfully
      if (errorOutput) {
        console.error('Test stderr:', errorOutput);
      }
      expect(output).toContain('✓ Running in bridge mode');

      await killProcess(child);
    });
  });

  describe('Config file handling', () => {
    it('should load configuration from stagewise.json', async () => {
      // Create a config file
      const config = {
        port: 4100,
        appPort: 4000,
        autoPlugins: true,
      };

      await fs.writeFile(
        path.join(testDir, 'stagewise.json'),
        JSON.stringify(config, null, 2),
        'utf-8',
      );

      const child = spawn(
        'tsx',
        ['src/index.ts', '-w', testDir, '-s', '-t', 'test-token'],
        {
          cwd: process.cwd(),
          shell: false,
        },
      );

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      // Wait a bit for the process to start
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // The CLI should use the config file values
      expect(output).toContain('4100');

      await killProcess(child);
    });

    it('should validate config file and fail on invalid schema', async () => {
      // Create an invalid config file
      const { appPort } = getTestPorts();
      const invalidConfig = {
        port: 'not a number', // Should be number
        appPort,
      };

      await fs.writeFile(
        path.join(testDir, 'stagewise.json'),
        JSON.stringify(invalidConfig, null, 2),
        'utf-8',
      );

      const child = spawn(
        'tsx',
        ['src/index.ts', '-w', testDir, '-s', '-t', 'test-token'],
        {
          cwd: process.cwd(),
          shell: false,
        },
      );

      let errorOutput = '';
      let output = '';
      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      const exitCode = await new Promise<number>((resolve) => {
        child.on('exit', (code) => resolve(code || 0));
      });

      expect(exitCode).not.toBe(0);
      // Check both stderr and stdout for the error message
      const combinedOutput = errorOutput + output;
      expect(combinedOutput).toContain(
        'Invalid configuration in stagewise.json',
      );

      await killProcess(child);
    });
  });

  describe('Bridge mode', () => {
    it('should start in bridge mode without requiring app-port', async () => {
      const child = spawn('tsx', ['src/index.ts', '-b', '-s'], {
        cwd: process.cwd(),
        shell: false,
      });

      let _output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        _output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      // Wait a bit for the process to start
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Should start without errors
      expect(errorOutput).not.toContain('app-port');

      await killProcess(child);
    });
  });

  describe('Verbose mode', () => {
    it('should output debug information in verbose mode', async () => {
      const child = spawn(
        'tsx',
        [
          'src/index.ts',
          '-a',
          String(getTestPorts().appPort),
          '-w',
          testDir,
          '-v',
          '-s',
          '-t',
          'test-token',
        ],
        {
          cwd: process.cwd(),
          shell: false,
        },
      );

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      // Wait a bit for debug output
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Should contain debug prefix
      expect(output).toContain('[DEBUG]');

      await killProcess(child);
    });
  });
});
