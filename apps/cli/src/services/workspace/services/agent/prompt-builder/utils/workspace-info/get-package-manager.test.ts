import { describe, it, expect } from 'vitest';
import { ClientRuntimeMock } from '@stagewise/agent-runtime-mock';
import { getPackageManager } from './get-package-manager.js';

describe('getPackageManager', () => {
  it('should detect pnpm from packageManager field with version', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
          packageManager: 'pnpm@10.10.0',
        }),
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toEqual({
      name: 'pnpm',
      version: '10.10.0',
    });
  });

  it('should detect yarn from packageManager field without version', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
          packageManager: 'yarn',
        }),
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toEqual({
      name: 'yarn',
    });
  });

  it('should prioritize packageManager field over lock files', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
          packageManager: 'npm@9.0.0',
        }),
        'pnpm-lock.yaml': 'lockfileVersion: 6.1',
        'yarn.lock': '# yarn lockfile v1',
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toEqual({
      name: 'npm',
      version: '9.0.0',
    });
  });

  it('should detect pnpm from lock file', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
        }),
        'pnpm-lock.yaml': 'lockfileVersion: 6.1',
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toEqual({
      name: 'pnpm',
    });
  });

  it('should detect yarn from lock file', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
        }),
        'yarn.lock': '# yarn lockfile v1',
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toEqual({
      name: 'yarn',
    });
  });

  it('should detect bun from lock file', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
        }),
        'bun.lockb': 'binary lock file content',
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toEqual({
      name: 'bun',
    });
  });

  it('should detect npm from lock file', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
        }),
        'package-lock.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
          lockfileVersion: 3,
        }),
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toEqual({
      name: 'npm',
    });
  });

  it('should detect pnpm from workspace configuration file', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
        }),
        'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n  - "packages/*"',
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toEqual({
      name: 'pnpm',
    });
  });

  it('should detect yarn from .yarnrc.yml file', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
        }),
        '.yarnrc.yml': 'nodeLinker: node-modules',
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toEqual({
      name: 'yarn',
    });
  });

  it('should detect yarn from legacy .yarnrc file', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
        }),
        '.yarnrc': 'yarn-path ".yarn/releases/yarn-1.22.19.cjs"',
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toEqual({
      name: 'yarn',
    });
  });

  it('should detect npm from workspaces field when no lock file exists', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
          workspaces: ['packages/*', 'apps/*'],
        }),
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toEqual({
      name: 'npm',
    });
  });

  it('should return null when no package manager can be detected', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
        }),
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toBe(null);
  });

  it('should return null when no package.json exists', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'README.md': '# Project without package.json',
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toBe(null);
  });

  it('should handle invalid packageManager field gracefully', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
          packageManager: 'unknown-manager@1.0.0',
        }),
        'pnpm-lock.yaml': 'lockfileVersion: 6.1',
      },
    });

    const result = await getPackageManager(mockRuntime);

    // Should fall back to lock file detection
    expect(result).toEqual({
      name: 'pnpm',
    });
  });

  it('should handle malformed package.json gracefully', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': '{ invalid json',
        'yarn.lock': '# yarn lockfile v1',
      },
    });

    const result = await getPackageManager(mockRuntime);

    // Should still detect from lock file
    expect(result).toEqual({
      name: 'yarn',
    });
  });

  it('should detect from parent directory in monorepo structure', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/workspace/monorepo/packages/my-package/src',
      rgBinaryBasePath: '',
      initialFiles: {
        '/workspace/monorepo/package.json': JSON.stringify({
          name: 'monorepo',
          version: '1.0.0',
          packageManager: 'pnpm@10.10.0',
          workspaces: ['packages/*'],
        }),
        '/workspace/monorepo/packages/my-package/package.json': JSON.stringify({
          name: 'my-package',
          version: '1.0.0',
        }),
      },
    });

    const result = await getPackageManager(mockRuntime);

    expect(result).toEqual({
      name: 'pnpm',
      version: '10.10.0',
    });
  });

  it('should respect detection priority order for lock files', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      rgBinaryBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
        }),
        // Multiple lock files present (edge case)
        'pnpm-lock.yaml': 'lockfileVersion: 6.1',
        'yarn.lock': '# yarn lockfile v1',
        'package-lock.json': JSON.stringify({ lockfileVersion: 3 }),
      },
    });

    const result = await getPackageManager(mockRuntime);

    // Should detect pnpm as it has highest priority
    expect(result).toEqual({
      name: 'pnpm',
    });
  });
});
