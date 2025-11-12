import { describe, it, expect } from 'vitest';
import { ClientRuntimeMock } from '@stagewise/agent-runtime-mock';
import { findProjectRoot, getProjectRoot } from './get-project-root.js';

describe('findProjectRoot', () => {
  it('should find package.json in current directory', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project',
      ripgrepBasePath: '',
      initialFiles: {
        'package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
        }),
      },
    });

    const result = await findProjectRoot(mockRuntime);

    expect(result).toBe('/test/project');
  });

  it('should find package.json in parent directory', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project/src',
      ripgrepBasePath: '',
      initialFiles: {
        '/test/project/package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
        }),
      },
    });

    const result = await findProjectRoot(mockRuntime);

    expect(result).toBe('/test/project');
  });

  it('should find outermost package.json in monorepo structure', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/workspace/monorepo/packages/my-package/src',
      ripgrepBasePath: '',
      initialFiles: {
        '/workspace/monorepo/packages/my-package/package.json': JSON.stringify({
          name: 'my-package',
          version: '1.0.0',
        }),
        '/workspace/monorepo/package.json': JSON.stringify({
          name: 'monorepo',
          version: '1.0.0',
          workspaces: ['packages/*'],
        }),
      },
    });

    const result = await findProjectRoot(mockRuntime);

    expect(result).toBe('/workspace/monorepo');
  });

  it('should return null when no package.json exists anywhere', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project/src/deep/nested',
      ripgrepBasePath: '',
      initialFiles: {
        '/test/project/src/deep/nested/README.md': '# No package.json here',
        '/test/project/src/other-file.txt': 'Some content',
      },
    });

    const result = await findProjectRoot(mockRuntime);

    expect(result).toBe(null);
  });

  it('should handle nested package.json files correctly', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/workspace/app/frontend/components',
      ripgrepBasePath: '',
      initialFiles: {
        '/workspace/app/frontend/package.json': JSON.stringify({
          name: 'frontend',
          version: '1.0.0',
        }),
        '/workspace/app/package.json': JSON.stringify({
          name: 'app',
          version: '1.0.0',
        }),
        '/workspace/package.json': JSON.stringify({
          name: 'workspace',
          version: '1.0.0',
          workspaces: ['apps/*'],
        }),
      },
    });

    const result = await findProjectRoot(mockRuntime);

    expect(result).toBe('/workspace');
  });

  it('should find package.json several levels up', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/src/components/ui/buttons',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/package.json': JSON.stringify({
          name: 'my-project',
          version: '2.0.0',
        }),
      },
    });

    const result = await findProjectRoot(mockRuntime);

    expect(result).toBe('/project');
  });

  it('should work with complex monorepo structure', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/monorepo/apps/web/src/pages',
      ripgrepBasePath: '',
      initialFiles: {
        '/monorepo/apps/web/src/package.json': JSON.stringify({
          name: 'web-app',
          version: '1.0.0',
        }),
        '/monorepo/apps/web/package.json': JSON.stringify({
          name: 'web',
          version: '1.0.0',
        }),
        '/monorepo/packages/ui/package.json': JSON.stringify({
          name: '@monorepo/ui',
          version: '1.0.0',
        }),
        '/monorepo/package.json': JSON.stringify({
          name: 'monorepo',
          version: '1.0.0',
          workspaces: ['apps/*', 'packages/*'],
        }),
      },
    });

    const result = await findProjectRoot(mockRuntime);

    expect(result).toBe('/monorepo');
  });

  it('should handle filesystem root boundary', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/usr/local/bin',
      ripgrepBasePath: '',
      initialFiles: {
        '/package.json': JSON.stringify({
          name: 'root-project',
          version: '1.0.0',
        }),
      },
    });

    const result = await findProjectRoot(mockRuntime);

    expect(result).toBe('/');
  });

  it('should return null when starting from filesystem root with no package.json', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/',
      ripgrepBasePath: '',
      initialFiles: {},
    });

    const result = await findProjectRoot(mockRuntime);
    expect(result).toBe(null);
  });
});

describe('getProjectRoot (backwards compatibility)', () => {
  it('should work as an alias for findProjectRoot', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/test/project/src',
      ripgrepBasePath: '',
      initialFiles: {
        '/test/project/package.json': JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
        }),
      },
    });

    const findResult = await findProjectRoot(mockRuntime);
    const getResult = await getProjectRoot(mockRuntime);

    expect(findResult).toBe(getResult);
    expect(getResult).toBe('/test/project');
  });
});
