import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, '../../src/index.ts');
const testWorkspace = path.join(__dirname, 'test-workspace-config-errors');

let portOffset = 100;
function getTestPorts() {
  const basePort = 5100 + portOffset;
  const appPort = 5000 + portOffset;
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

describe('Config Error Handling Integration Tests', () => {
  beforeEach(async () => {
    // Create test workspace
    await fs.mkdir(testWorkspace, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test workspace
    await fs.rm(testWorkspace, { recursive: true, force: true });
  });

  it('should gracefully handle invalid JSON in stagewise.json', async () => {
    // Create invalid JSON file
    await fs.writeFile(
      path.join(testWorkspace, 'stagewise.json'),
      '{ "port": 3100, invalid json here }',
    );

    const child = spawn(
      'tsx',
      [cliPath, '-w', testWorkspace, '--silent', '-t', 'test-token'],
      {
        env: { ...process.env, NODE_ENV: 'test' },
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

    await new Promise<void>((resolve) => {
      child.on('exit', (code) => {
        const combinedOutput = output + errorOutput;
        expect(code).toBe(1);
        expect(combinedOutput).toContain('Failed to parse stagewise.json');
        expect(combinedOutput).toContain(
          'Please fix the errors in stagewise.json and try again',
        );
        resolve();
      });
    });
  });

  it('should gracefully handle invalid port number', async () => {
    // Create config with invalid port
    await fs.writeFile(
      path.join(testWorkspace, 'stagewise.json'),
      JSON.stringify({ port: 99999, appPort: getTestPorts().appPort }, null, 2),
    );

    const child = spawn(
      'tsx',
      [cliPath, '-w', testWorkspace, '--silent', '-t', 'test-token'],
      {
        env: { ...process.env, NODE_ENV: 'test' },
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

    await new Promise<void>((resolve) => {
      child.on('exit', (code) => {
        const combinedOutput = output + errorOutput;
        expect(code).toBe(1);
        expect(combinedOutput).toContain(
          'Invalid configuration in stagewise.json',
        );
        expect(combinedOutput).toContain(
          'Port number must be between 1 and 65535',
        );
        resolve();
      });
    });
  });

  it('should gracefully handle string port number', async () => {
    // Create config with string port
    await fs.writeFile(
      path.join(testWorkspace, 'stagewise.json'),
      JSON.stringify({ port: '5100', appPort: getTestPorts().appPort }, null, 2),
    );

    const child = spawn(
      'tsx',
      [cliPath, '-w', testWorkspace, '--silent', '-t', 'test-token'],
      {
        env: { ...process.env, NODE_ENV: 'test' },
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

    await new Promise<void>((resolve) => {
      child.on('exit', (code) => {
        const combinedOutput = output + errorOutput;
        expect(code).toBe(1);
        expect(combinedOutput).toContain(
          'Invalid configuration in stagewise.json',
        );
        expect(combinedOutput).toContain('port: Must be a number');
        resolve();
      });
    });
  });

  it('should gracefully handle invalid plugin configuration', async () => {
    // Create config with invalid plugin (both path and url)
    await fs.writeFile(
      path.join(testWorkspace, 'stagewise.json'),
      JSON.stringify(
        {
          port: getTestPorts().port,
          appPort: getTestPorts().appPort,
          plugins: [
            {
              name: 'bad-plugin',
              path: './plugin',
              url: 'https://example.com/plugin',
            },
          ],
        },
        null,
        2,
      ),
    );

    const child = spawn(
      'tsx',
      [cliPath, '-w', testWorkspace, '--silent', '-t', 'test-token'],
      {
        env: { ...process.env, NODE_ENV: 'test' },
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

    await new Promise<void>((resolve) => {
      child.on('exit', (code) => {
        const combinedOutput = output + errorOutput;
        expect(code).toBe(1);
        expect(combinedOutput).toContain(
          'Invalid configuration in stagewise.json',
        );
        expect(combinedOutput).toContain(
          'Plugin must have either "path" or "url", but not both',
        );
        resolve();
      });
    });
  });

  it('should start successfully with valid config after fixing errors', async () => {
    // First create invalid config
    await fs.writeFile(
      path.join(testWorkspace, 'stagewise.json'),
      '{ invalid json }',
    );

    // Try to start with invalid config
    const child1 = spawn('node', [cliPath, '-w', testWorkspace, '--silent'], {
      env: { ...process.env, NODE_ENV: 'test' },
    });

    await new Promise<void>((resolve) => {
      child1.on('exit', (code) => {
        expect(code).toBe(1);
        resolve();
      });
    });

    // Now fix the config with a different port to avoid conflicts
    await fs.writeFile(
      path.join(testWorkspace, 'stagewise.json'),
      JSON.stringify({ port: getTestPorts().port, appPort: getTestPorts().appPort }, null, 2),
    );

    // Try again with valid config
    const child2 = spawn(
      'tsx',
      [cliPath, '-w', testWorkspace, '--silent', '-t', 'test-token'],
      {
        env: { ...process.env, NODE_ENV: 'test' },
      },
    );

    let output = '';
    let errorOutput = '';
    child2.stdout.on('data', (data) => {
      output += data.toString();
    });
    child2.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Give the server time to start
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check that server started successfully
    // Should not have fatal errors
    expect(errorOutput).not.toContain('Error');
    expect(errorOutput).not.toContain('Failed');
    // The process should still be running
    expect(child2.killed).toBe(false);

    await killProcess(child2);
  });
});
