import { describe, it, expect } from 'vitest';
import { ClientRuntimeMock } from '@stagewise/agent-runtime-mock';
import type { DirectoryJSON } from '@stagewise/agent-runtime-mock';
import { getProjectPackages } from './get-project-packages.js';

describe('getProjectPackages', () => {
  describe('Basic monorepo detection', () => {
    it('should detect pnpm workspace monorepo with resolved packages', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/monorepo',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/monorepo/package.json': JSON.stringify({
            name: 'monorepo',
            private: true,
            packageManager: 'pnpm@8.0.0',
          }),
          '/workspace/monorepo/pnpm-workspace.yaml': `packages:
- apps/*
- packages/*
- tools/*`,
          '/workspace/monorepo/pnpm-lock.yaml': '',
          // Add actual packages
          '/workspace/monorepo/apps/web/package.json': JSON.stringify({
            name: '@monorepo/web',
            version: '1.0.0',
          }),
          '/workspace/monorepo/packages/ui/package.json': JSON.stringify({
            name: '@monorepo/ui',
            version: '0.5.0',
          }),
          '/workspace/monorepo/tools/eslint-config/package.json':
            JSON.stringify({
              name: '@monorepo/eslint-config',
              version: '0.1.0',
            }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.rootPath).toBe('/workspace/monorepo');

      // Check tools - only detected ones should be present
      const pnpmTool = result.tools.find((t) => t.name === 'pnpm');
      expect(pnpmTool).toBeDefined();
      expect(pnpmTool?.configFile).toBe('pnpm-workspace.yaml');
      expect(result.tools).toHaveLength(1); // Only pnpm should be detected

      // Check resolved packages
      expect(result.packages).toHaveLength(3);
      expect(result.packages).toContainEqual({
        name: '@monorepo/web',
        path: '/workspace/monorepo/apps/web',
        version: '1.0.0',
      });
      expect(result.packages).toContainEqual({
        name: '@monorepo/ui',
        path: '/workspace/monorepo/packages/ui',
        version: '0.5.0',
      });
      expect(result.packages).toContainEqual({
        name: '@monorepo/eslint-config',
        path: '/workspace/monorepo/tools/eslint-config',
        version: '0.1.0',
      });
    });

    it('should detect pnpm + turbo monorepo with multiple tools', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/stagewise',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/stagewise/package.json': JSON.stringify({
            name: 'stagewise',
            private: true,
            packageManager: 'pnpm@10.10.0',
          }),
          '/workspace/stagewise/pnpm-workspace.yaml': `packages:
- apps/*
- packages/*`,
          '/workspace/stagewise/turbo.json': JSON.stringify({
            $schema: 'https://turborepo.com/schema.json',
            pipeline: {
              build: { dependsOn: ['^build'] },
            },
          }),
          '/workspace/stagewise/pnpm-lock.yaml': '',
          '/workspace/stagewise/apps/web/package.json': JSON.stringify({
            name: '@stagewise/web',
            version: '2.0.0',
          }),
          '/workspace/stagewise/apps/docs/package.json': JSON.stringify({
            name: '@stagewise/docs',
            version: '1.0.0',
          }),
          '/workspace/stagewise/packages/core/package.json': JSON.stringify({
            name: '@stagewise/core',
            version: '3.0.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);

      // Check multiple tools detected
      expect(result.tools).toHaveLength(2);
      expect(result.tools.map((t) => t.name).sort()).toEqual(['pnpm', 'turbo']);

      // Check packages are resolved and sorted by path
      expect(result.packages).toHaveLength(3);
      expect(result.packages[0]?.path).toBe('/workspace/stagewise/apps/docs');
      expect(result.packages[1]?.path).toBe('/workspace/stagewise/apps/web');
      expect(result.packages[2]?.path).toBe(
        '/workspace/stagewise/packages/core',
      );
    });

    it('should detect lerna monorepo with scoped packages', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/lerna-repo',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/lerna-repo/package.json': JSON.stringify({
            name: 'lerna-monorepo',
            private: true,
          }),
          '/workspace/lerna-repo/lerna.json': JSON.stringify({
            version: '1.0.0',
            packages: ['packages/*', 'apps/*'],
            npmClient: 'npm',
          }),
          '/workspace/lerna-repo/package-lock.json': '',
          '/workspace/lerna-repo/packages/utils/package.json': JSON.stringify({
            name: '@company/utils',
            version: '1.0.0',
          }),
          '/workspace/lerna-repo/packages/components/package.json':
            JSON.stringify({
              name: '@company/components',
              version: '1.2.0',
            }),
          '/workspace/lerna-repo/apps/admin/package.json': JSON.stringify({
            name: '@company/admin-app',
            version: '0.1.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);

      const lernaTool = result.tools.find((t) => t.name === 'lerna');
      expect(lernaTool).toBeDefined();
      expect(lernaTool?.configFile).toBe('lerna.json');

      expect(result.packages).toHaveLength(3);
      expect(result.packages.every((p) => p.name.startsWith('@company/'))).toBe(
        true,
      );
    });

    it('should detect nx monorepo with custom layout', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/nx-repo',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/nx-repo/package.json': JSON.stringify({
            name: 'nx-workspace',
            private: true,
          }),
          '/workspace/nx-repo/nx.json': JSON.stringify({
            version: 2,
            workspaceLayout: {
              appsDir: 'applications',
              libsDir: 'libraries',
            },
          }),
          '/workspace/nx-repo/yarn.lock': '',
          '/workspace/nx-repo/applications/frontend/package.json':
            JSON.stringify({
              name: 'frontend',
              version: '1.0.0',
            }),
          '/workspace/nx-repo/libraries/shared/package.json': JSON.stringify({
            name: '@nx/shared',
            version: '1.0.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);

      const nxTool = result.tools.find((t) => t.name === 'nx');
      expect(nxTool).toBeDefined();

      expect(result.packages).toHaveLength(2);
      expect(
        result.packages.find((p) => p.path.includes('applications')),
      ).toBeDefined();
      expect(
        result.packages.find((p) => p.path.includes('libraries')),
      ).toBeDefined();
    });

    it('should detect rush monorepo with explicit projects', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/rush-repo',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/rush-repo/package.json': JSON.stringify({
            name: 'rush-monorepo',
            private: true,
          }),
          '/workspace/rush-repo/rush.json': JSON.stringify({
            rushVersion: '5.0.0',
            projects: [
              { packageName: '@rush/app1', projectFolder: 'apps/app1' },
              { packageName: '@rush/lib1', projectFolder: 'libraries/lib1' },
              { packageName: '@rush/tool1', projectFolder: 'tools/tool1' },
            ],
          }),
          '/workspace/rush-repo/package-lock.json': '',
          '/workspace/rush-repo/apps/app1/package.json': JSON.stringify({
            name: '@rush/app1',
            version: '1.0.0',
          }),
          '/workspace/rush-repo/libraries/lib1/package.json': JSON.stringify({
            name: '@rush/lib1',
            version: '2.0.0',
          }),
          '/workspace/rush-repo/tools/tool1/package.json': JSON.stringify({
            name: '@rush/tool1',
            version: '0.5.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);

      const rushTool = result.tools.find((t) => t.name === 'rush');
      expect(rushTool).toBeDefined();

      expect(result.packages).toHaveLength(3);
      expect(result.packages.map((p) => p.name).sort()).toEqual([
        '@rush/app1',
        '@rush/lib1',
        '@rush/tool1',
      ]);
    });
  });

  describe('Workspace patterns and package resolution', () => {
    it('should handle npm workspaces with nested structure', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/npm-workspace',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/npm-workspace/package.json': JSON.stringify({
            name: 'npm-workspace',
            private: true,
            workspaces: {
              packages: ['packages/*', 'tools/*'],
            },
          }),
          '/workspace/npm-workspace/package-lock.json': '',
          '/workspace/npm-workspace/packages/core/package.json': JSON.stringify(
            {
              name: 'core',
              version: '1.0.0',
            },
          ),
          '/workspace/npm-workspace/packages/utils/package.json':
            JSON.stringify({
              name: 'utils',
              version: '1.0.0',
            }),
          '/workspace/npm-workspace/tools/cli/package.json': JSON.stringify({
            name: 'cli-tool',
            version: '0.1.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.packages).toHaveLength(3);
    });

    it('should handle yarn workspaces with array format', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/yarn-workspace',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/yarn-workspace/package.json': JSON.stringify({
            name: 'yarn-workspace',
            private: true,
            workspaces: ['packages/*', 'apps/*'],
          }),
          '/workspace/yarn-workspace/yarn.lock': '',
          '/workspace/yarn-workspace/packages/lib/package.json': JSON.stringify(
            {
              name: '@yarn/lib',
              version: '1.0.0',
            },
          ),
          '/workspace/yarn-workspace/apps/web/package.json': JSON.stringify({
            name: '@yarn/web',
            version: '2.0.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.tools.find((t) => t.name === 'yarn')).toBeDefined();
      expect(result.packages).toHaveLength(2);
    });

    it('should handle bun workspaces', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/bun-workspace',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/bun-workspace/package.json': JSON.stringify({
            name: 'bun-workspace',
            private: true,
            workspaces: ['packages/*'],
            packageManager: 'bun@1.0.0',
          }),
          '/workspace/bun-workspace/bun.lockb': '',
          '/workspace/bun-workspace/packages/core/package.json': JSON.stringify(
            {
              name: '@bun/core',
              version: '1.0.0',
            },
          ),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0]?.name).toBe('@bun/core');
    });

    it('should handle direct package paths (no wildcards)', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/direct',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/direct/package.json': JSON.stringify({
            name: 'direct-workspace',
            private: true,
            workspaces: ['frontend', 'backend', 'shared'],
          }),
          '/workspace/direct/yarn.lock': '',
          '/workspace/direct/frontend/package.json': JSON.stringify({
            name: 'frontend',
            version: '1.0.0',
          }),
          '/workspace/direct/backend/package.json': JSON.stringify({
            name: 'backend',
            version: '1.0.0',
          }),
          '/workspace/direct/shared/package.json': JSON.stringify({
            name: 'shared',
            version: '1.0.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.packages).toHaveLength(3);
      expect(result.packages.map((p) => p.name).sort()).toEqual([
        'backend',
        'frontend',
        'shared',
      ]);
    });

    it('should handle deep glob patterns with **', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/deep',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/deep/package.json': JSON.stringify({
            name: 'deep-workspace',
            private: true,
          }),
          '/workspace/deep/pnpm-workspace.yaml': `packages:
- "packages/**"`,
          '/workspace/deep/pnpm-lock.yaml': '',
          '/workspace/deep/packages/utils/package.json': JSON.stringify({
            name: 'utils',
            version: '1.0.0',
          }),
          '/workspace/deep/packages/features/auth/package.json': JSON.stringify(
            {
              name: '@features/auth',
              version: '1.0.0',
            },
          ),
          '/workspace/deep/packages/features/billing/package.json':
            JSON.stringify({
              name: '@features/billing',
              version: '1.0.0',
            }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.packages).toHaveLength(3);
      expect(
        result.packages.find((p) => p.path.includes('features/auth')),
      ).toBeDefined();
      expect(
        result.packages.find((p) => p.path.includes('features/billing')),
      ).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle non-monorepo project', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/project/single-package',
        rgBinaryBasePath: '',
        initialFiles: {
          '/project/single-package/package.json': JSON.stringify({
            name: 'single-package',
            version: '1.0.0',
          }),
          '/project/single-package/package-lock.json': '',
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(false);
      expect(result.rootPath).toBe('/project/single-package');
      expect(result.packages).toEqual([]);
      expect(result.tools).toEqual([]);
    });

    it('should handle project with no package.json', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/project/no-package',
        rgBinaryBasePath: '',
        initialFiles: {
          '/project/no-package/README.md': '# Just a regular directory',
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(false);
      expect(result.rootPath).toBe(null);
      expect(result.packages).toEqual([]);
      expect(result.tools).toEqual([]);
    });

    it('should handle workspace patterns with no actual packages', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/empty',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/empty/package.json': JSON.stringify({
            name: 'empty-workspace',
            private: true,
            workspaces: ['packages/*', 'apps/*'],
          }),
          '/workspace/empty/yarn.lock': '',
          // No actual package directories
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true); // Still a monorepo structure
      expect(result.packages).toEqual([]); // But no actual packages
      expect(result.tools.find((t) => t.name === 'yarn')).toBeDefined();
    });

    it('should handle packages without package.json files', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/missing-pkgjson',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/missing-pkgjson/package.json': JSON.stringify({
            name: 'workspace',
            private: true,
            workspaces: ['packages/*'],
          }),
          '/workspace/missing-pkgjson/yarn.lock': '',
          '/workspace/missing-pkgjson/packages/lib1/index.js':
            'module.exports = {}',
          '/workspace/missing-pkgjson/packages/lib2/package.json':
            JSON.stringify({
              name: 'lib2',
              version: '1.0.0',
            }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.packages).toHaveLength(1); // Only lib2 has package.json
      expect(result.packages[0]?.name).toBe('lib2');
    });

    it('should handle packages with missing or invalid names', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/invalid-names',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/invalid-names/package.json': JSON.stringify({
            name: 'workspace',
            private: true,
            workspaces: ['packages/*'],
          }),
          '/workspace/invalid-names/yarn.lock': '',
          '/workspace/invalid-names/packages/no-name/package.json':
            JSON.stringify({
              version: '1.0.0', // Missing name
            }),
          '/workspace/invalid-names/packages/valid/package.json':
            JSON.stringify({
              name: 'valid-package',
              version: '1.0.0',
            }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.packages).toHaveLength(2);
      // Package without name should use directory name as fallback
      expect(result.packages.find((p) => p.name === 'no-name')).toBeDefined();
      expect(
        result.packages.find((p) => p.name === 'valid-package'),
      ).toBeDefined();
    });

    it('should handle malformed configuration files gracefully', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/malformed',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/malformed/package.json': JSON.stringify({
            name: 'malformed-config',
            private: true,
          }),
          '/workspace/malformed/lerna.json': '{invalid json}',
          '/workspace/malformed/nx.json': '{"malformed": json without closing',
          '/workspace/malformed/turbo.json': JSON.stringify({
            $schema: 'https://turborepo.com/schema.json',
            pipeline: {},
          }),
          '/workspace/malformed/package-lock.json': '',
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true); // turbo.json is valid

      // Malformed files should still be detected as present
      const lernaTool = result.tools.find((t) => t.name === 'lerna');
      const nxTool = result.tools.find((t) => t.name === 'nx');
      const turboTool = result.tools.find((t) => t.name === 'turbo');

      expect(lernaTool).toBeDefined();
      expect(nxTool).toBeDefined();
      expect(turboTool).toBeDefined();

      expect(result.packages).toEqual([]); // No packages extracted from malformed files
    });

    it('should deduplicate packages from multiple workspace sources', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/combined',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/combined/package.json': JSON.stringify({
            name: 'combined-workspace',
            private: true,
            workspaces: ['shared/*'],
          }),
          '/workspace/combined/pnpm-workspace.yaml': `packages:
- apps/*
- packages/*
- shared/*`, // Duplicate pattern
          '/workspace/combined/lerna.json': JSON.stringify({
            packages: ['tools/*', 'apps/*'], // Another duplicate
          }),
          '/workspace/combined/pnpm-lock.yaml': '',
          '/workspace/combined/apps/web/package.json': JSON.stringify({
            name: 'web',
            version: '1.0.0',
          }),
          '/workspace/combined/packages/ui/package.json': JSON.stringify({
            name: 'ui',
            version: '1.0.0',
          }),
          '/workspace/combined/shared/utils/package.json': JSON.stringify({
            name: 'utils',
            version: '1.0.0',
          }),
          '/workspace/combined/tools/cli/package.json': JSON.stringify({
            name: 'cli',
            version: '1.0.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.tools).toHaveLength(2); // pnpm and lerna
      expect(result.packages).toHaveLength(4); // Each package counted once

      // Verify no duplicates
      const packagePaths = result.packages.map((p) => p.path);
      expect(new Set(packagePaths).size).toBe(packagePaths.length);
    });

    it('should handle complex pnpm-workspace.yaml with comments and quotes', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/complex-pnpm',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/complex-pnpm/package.json': JSON.stringify({
            name: 'complex-pnpm',
            private: true,
          }),
          '/workspace/complex-pnpm/pnpm-workspace.yaml': `# Complex pnpm workspace
packages:
  # Apps
  - "apps/*"
  # Packages  
  - 'packages/*'
  # Tools without quotes
  - tools/*
  # Deep nesting
  - "libs/**"
  
# Some other config
catalog: {}`,
          '/workspace/complex-pnpm/pnpm-lock.yaml': '',
          '/workspace/complex-pnpm/apps/web/package.json': JSON.stringify({
            name: 'web',
            version: '1.0.0',
          }),
          '/workspace/complex-pnpm/packages/core/package.json': JSON.stringify({
            name: 'core',
            version: '1.0.0',
          }),
          '/workspace/complex-pnpm/tools/cli/package.json': JSON.stringify({
            name: 'cli',
            version: '1.0.0',
          }),
          '/workspace/complex-pnpm/libs/shared/utils/package.json':
            JSON.stringify({
              name: 'shared-utils',
              version: '1.0.0',
            }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.packages).toHaveLength(4);
      expect(result.packages.map((p) => p.name).sort()).toEqual([
        'cli',
        'core',
        'shared-utils',
        'web',
      ]);
    });
  });

  describe('Modern monorepo scenarios', () => {
    it('should handle Nx monorepo with default layout', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/nx-default',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/nx-default/package.json': JSON.stringify({
            name: 'nx-workspace',
            private: true,
          }),
          '/workspace/nx-default/nx.json': JSON.stringify({
            version: 2,
          }),
          '/workspace/nx-default/package-lock.json': '',
          '/workspace/nx-default/apps/app1/package.json': JSON.stringify({
            name: 'app1',
            version: '1.0.0',
          }),
          '/workspace/nx-default/libs/lib1/package.json': JSON.stringify({
            name: '@nx/lib1',
            version: '1.0.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.packages).toHaveLength(2);
      expect(
        result.packages.find((p) => p.path.includes('/apps/')),
      ).toBeDefined();
      expect(
        result.packages.find((p) => p.path.includes('/libs/')),
      ).toBeDefined();
    });

    it('should handle lage monorepo', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/lage-repo',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/lage-repo/package.json': JSON.stringify({
            name: 'lage-monorepo',
            private: true,
            workspaces: ['packages/*'],
          }),
          '/workspace/lage-repo/lage.config.js': `module.exports = {
  pipeline: {
    build: ["^build"],
    test: ["build"]
  }
};`,
          '/workspace/lage-repo/yarn.lock': '',
          '/workspace/lage-repo/packages/core/package.json': JSON.stringify({
            name: '@lage/core',
            version: '1.0.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);

      const lageTool = result.tools.find((t) => t.name === 'lage');
      expect(lageTool).toBeDefined();

      expect(result.packages).toHaveLength(1);
      expect(result.packages[0]?.name).toBe('@lage/core');
    });

    it('should handle monorepo with mixed tool configurations', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/mixed',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/mixed/package.json': JSON.stringify({
            name: 'mixed-tools',
            private: true,
            workspaces: ['packages/*'],
          }),
          '/workspace/mixed/pnpm-workspace.yaml': `packages:
- packages/*
- apps/*`,
          '/workspace/mixed/turbo.json': JSON.stringify({
            $schema: 'https://turborepo.com/schema.json',
            pipeline: {},
          }),
          '/workspace/mixed/lerna.json': JSON.stringify({
            version: 'independent',
            packages: ['packages/*'],
          }),
          '/workspace/mixed/nx.json': JSON.stringify({
            version: 2,
          }),
          '/workspace/mixed/pnpm-lock.yaml': '',
          '/workspace/mixed/packages/lib/package.json': JSON.stringify({
            name: 'lib',
            version: '1.0.0',
          }),
          '/workspace/mixed/apps/web/package.json': JSON.stringify({
            name: 'web',
            version: '1.0.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.tools.map((t) => t.name).sort()).toEqual([
        'lerna',
        'nx',
        'pnpm',
        'turbo',
      ]);
      expect(result.packages).toHaveLength(2);
    });

    it('should handle very large monorepo structure', async () => {
      const files: DirectoryJSON = {
        '/workspace/large/package.json': JSON.stringify({
          name: 'large-monorepo',
          private: true,
          workspaces: ['packages/*', 'apps/*', 'services/*'],
        }),
        '/workspace/large/yarn.lock': '',
      };

      // Generate 50 packages
      for (let i = 1; i <= 50; i++) {
        const category = i <= 20 ? 'packages' : i <= 35 ? 'apps' : 'services';
        const name = `${category}-${i}`;
        files[`/workspace/large/${category}/${name}/package.json`] =
          JSON.stringify({
            name: `@large/${name}`,
            version: '1.0.0',
          });
      }

      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/large',
        rgBinaryBasePath: '',
        initialFiles: files,
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.packages).toHaveLength(50);

      // Verify packages are sorted by path
      for (let i = 1; i < result.packages.length; i++) {
        expect(
          result.packages[i - 1]!.path.localeCompare(result.packages[i]!.path),
        ).toBeLessThan(0);
      }
    });

    it('should handle monorepo with version-less packages', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/no-versions',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/no-versions/package.json': JSON.stringify({
            name: 'no-versions-workspace',
            private: true,
            workspaces: ['packages/*'],
          }),
          '/workspace/no-versions/yarn.lock': '',
          '/workspace/no-versions/packages/lib1/package.json': JSON.stringify({
            name: 'lib1',
            // No version field
          }),
          '/workspace/no-versions/packages/lib2/package.json': JSON.stringify({
            name: 'lib2',
            version: '1.0.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.packages).toHaveLength(2);

      const lib1 = result.packages.find((p) => p.name === 'lib1');
      const lib2 = result.packages.find((p) => p.name === 'lib2');

      expect(lib1?.version).toBeUndefined();
      expect(lib2?.version).toBe('1.0.0');
    });

    it('should only return detected tools, not all possible tools', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/simple',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/simple/package.json': JSON.stringify({
            name: 'simple-project',
            workspaces: ['packages/*'],
          }),
          '/workspace/simple/package-lock.json': '',
          '/workspace/simple/packages/lib/package.json': JSON.stringify({
            name: 'lib',
            version: '1.0.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.tools).toHaveLength(0); // No monorepo tools detected
      expect(result.packages).toHaveLength(1);
    });

    it('should handle workspace patterns pointing to non-existent directories', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/missing-dirs',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/missing-dirs/package.json': JSON.stringify({
            name: 'missing-dirs',
            private: true,
            workspaces: ['packages/*', 'apps/*', 'services/*'],
          }),
          '/workspace/missing-dirs/yarn.lock': '',
          // Only packages directory exists
          '/workspace/missing-dirs/packages/core/package.json': JSON.stringify({
            name: 'core',
            version: '1.0.0',
          }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.packages).toHaveLength(1); // Only finds the existing package
      expect(result.packages[0]?.name).toBe('core');
    });

    it('should handle deeply nested monorepo structures', async () => {
      const mockRuntime = new ClientRuntimeMock({
        workingDirectory: '/workspace/nested',
        rgBinaryBasePath: '',
        initialFiles: {
          '/workspace/nested/package.json': JSON.stringify({
            name: 'nested-workspace',
            private: true,
          }),
          '/workspace/nested/pnpm-workspace.yaml': `packages:
- "services/**"`, // Deep pattern with **
          '/workspace/nested/pnpm-lock.yaml': '',
          '/workspace/nested/services/backend/auth/package.json':
            JSON.stringify({
              name: '@services/auth',
              version: '1.0.0',
            }),
          '/workspace/nested/services/backend/api/package.json': JSON.stringify(
            {
              name: '@services/api',
              version: '1.0.0',
            },
          ),
          '/workspace/nested/services/frontend/web/package.json':
            JSON.stringify({
              name: '@services/web',
              version: '1.0.0',
            }),
        },
      });

      const result = await getProjectPackages(mockRuntime);

      expect(result.isMonorepo).toBe(true);
      expect(result.packages).toHaveLength(3);
      expect(result.packages.map((p) => p.name).sort()).toEqual([
        '@services/api',
        '@services/auth',
        '@services/web',
      ]);
    });
  });
});
