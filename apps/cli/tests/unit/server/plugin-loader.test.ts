import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import {
  loadPlugins,
  generatePluginImportMapEntries,
  getPluginNames,
  type Plugin,
} from '../../../src/server/plugin-loader.js';
import type { Config } from '../../../src/config/types.js';
import {
  discoverDependencies,
  getDependencyList,
} from '../../../src/utils/dependency-parser/index.js';

vi.mock('node:fs');
vi.mock('../../../src/dependency-parser/index.js');
vi.mock('../../../src/utils/logger.js', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('plugin-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadPlugins', () => {
    const baseConfig: Config = {
      port: 3000,
      appPort: 5173,
      dir: '/test/dir',
      silent: false,
      verbose: false,
      bridgeMode: false,
      autoPlugins: true,
      plugins: [],
    };

    beforeEach(() => {
      // Default mock: all paths exist
      vi.mocked(existsSync).mockReturnValue(true);
    });

    it('should auto-load React plugin when React dependencies are found', async () => {
      vi.mocked(discoverDependencies).mockResolvedValue({
        react: {
          name: 'react',
          version: '18.0.0',
          major: 18,
          minor: 0,
          patch: 0,
        },
        'react-dom': {
          name: 'react-dom',
          version: '18.0.0',
          major: 18,
          minor: 0,
          patch: 0,
        },
      });
      vi.mocked(getDependencyList).mockReturnValue(['react', 'react-dom']);

      const plugins = await loadPlugins(baseConfig);

      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.name).toBe('@stagewise-plugins/react');
      expect(plugins[0]?.path).toMatch(
        /node_modules\/@stagewise-plugins\/react\/dist$/,
      );
      expect(plugins[0]?.available).toBe(true);
    });

    it('should auto-load Angular plugin when Angular dependencies are found', async () => {
      vi.mocked(discoverDependencies).mockResolvedValue({
        '@angular/core': {
          name: '@angular/core',
          version: '17.0.0',
          major: 17,
          minor: 0,
          patch: 0,
        },
        '@angular/common': {
          name: '@angular/common',
          version: '17.0.0',
          major: 17,
          minor: 0,
          patch: 0,
        },
      });
      vi.mocked(getDependencyList).mockReturnValue([
        '@angular/core',
        '@angular/common',
      ]);

      const plugins = await loadPlugins(baseConfig);

      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.name).toBe('@stagewise-plugins/angular');
      expect(plugins[0]?.path).toMatch(
        /node_modules\/@stagewise-plugins\/angular\/dist$/,
      );
    });

    it('should auto-load Vue plugin when Vue dependencies are found', async () => {
      vi.mocked(discoverDependencies).mockResolvedValue({
        vue: { name: 'vue', version: '3.0.0', major: 3, minor: 0, patch: 0 },
      });
      vi.mocked(getDependencyList).mockReturnValue(['vue']);

      const plugins = await loadPlugins(baseConfig);

      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.name).toBe('@stagewise-plugins/vue');
      expect(plugins[0]?.path).toMatch(
        /node_modules\/@stagewise-plugins\/vue\/dist$/,
      );
    });

    it('should load multiple plugins when multiple framework dependencies are found', async () => {
      vi.mocked(discoverDependencies).mockResolvedValue({
        react: {
          name: 'react',
          version: '18.0.0',
          major: 18,
          minor: 0,
          patch: 0,
        },
        vue: { name: 'vue', version: '3.0.0', major: 3, minor: 0, patch: 0 },
      });
      vi.mocked(getDependencyList).mockReturnValue(['react', 'vue']);

      const plugins = await loadPlugins(baseConfig);

      expect(plugins).toHaveLength(2);
      expect(plugins.map((p) => p.name)).toContain('@stagewise-plugins/react');
      expect(plugins.map((p) => p.name)).toContain('@stagewise-plugins/vue');
    });

    it('should not auto-load plugins when autoPlugins is false', async () => {
      const config = { ...baseConfig, autoPlugins: false };

      const plugins = await loadPlugins(config);

      expect(plugins).toHaveLength(0);
      expect(discoverDependencies).not.toHaveBeenCalled();
    });

    it('should load manual plugins from config', async () => {
      const config = {
        ...baseConfig,
        autoPlugins: false,
        plugins: ['@custom/plugin', '@another/plugin'],
      };

      const plugins = await loadPlugins(config);

      expect(plugins).toHaveLength(2);
      expect(plugins[0]).toEqual({
        name: '@custom/plugin',
        url: 'https://esm.sh/@custom/plugin',
        available: true,
      });
      expect(plugins[1]).toEqual({
        name: '@another/plugin',
        url: 'https://esm.sh/@another/plugin',
        available: true,
      });
    });

    it('should load bundled plugins locally when manually configured', async () => {
      const config = {
        ...baseConfig,
        autoPlugins: false,
        plugins: ['@stagewise-plugins/react', '@custom/plugin'],
      };

      const plugins = await loadPlugins(config);

      expect(plugins).toHaveLength(2);
      expect(plugins[0]?.name).toBe('@stagewise-plugins/react');
      expect(plugins[0]?.path).toMatch(
        /node_modules\/@stagewise-plugins\/react\/dist$/,
      );
      expect(plugins[1]).toEqual({
        name: '@custom/plugin',
        url: 'https://esm.sh/@custom/plugin',
        available: true,
      });
    });

    it('should load manual plugins with custom URLs', async () => {
      const config = {
        ...baseConfig,
        autoPlugins: false,
        plugins: [
          {
            name: '@custom/plugin',
            url: 'https://custom.cdn.com/plugin.js',
          },
        ],
      };

      const plugins = await loadPlugins(config);

      expect(plugins).toHaveLength(1);
      expect(plugins[0]).toEqual({
        name: '@custom/plugin',
        url: 'https://custom.cdn.com/plugin.js',
      });
    });

    it('should load manual plugins with local paths', async () => {
      const config = {
        ...baseConfig,
        autoPlugins: false,
        plugins: [
          {
            name: '@local/plugin',
            path: './plugins/local-plugin',
          },
        ],
      };

      const plugins = await loadPlugins(config);

      expect(plugins).toHaveLength(1);
      expect(plugins[0]!.name).toBe('@local/plugin');
      expect(plugins[0]!.path).toMatch(/plugins\/local-plugin$/);
      expect(plugins[0]!.available).toBe(true);
    });

    it('should override auto-loaded plugins with manual config', async () => {
      vi.mocked(discoverDependencies).mockResolvedValue({
        react: {
          name: 'react',
          version: '18.0.0',
          major: 18,
          minor: 0,
          patch: 0,
        },
      });
      vi.mocked(getDependencyList).mockReturnValue(['react']);

      const config = {
        ...baseConfig,
        plugins: [
          {
            name: '@stagewise-plugins/react',
            url: 'https://custom.cdn.com/react-plugin.js',
          },
        ],
      };

      const plugins = await loadPlugins(config);

      expect(plugins).toHaveLength(1);
      expect(plugins[0]).toEqual({
        name: '@stagewise-plugins/react',
        url: 'https://custom.cdn.com/react-plugin.js',
      });
    });

    it('should mark plugin as unavailable when directory is missing', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = path.toString();
        return !pathStr.includes('@stagewise-plugins/react');
      });
      vi.mocked(discoverDependencies).mockResolvedValue({
        react: {
          name: 'react',
          version: '18.0.0',
          major: 18,
          minor: 0,
          patch: 0,
        },
      });
      vi.mocked(getDependencyList).mockReturnValue(['react']);

      const plugins = await loadPlugins(baseConfig);

      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.name).toBe('@stagewise-plugins/react');
      expect(plugins[0]?.available).toBe(false);
      expect(plugins[0]?.error).toContain('Plugin directory not found');
    });

    it('should mark plugin as unavailable when index.js is missing', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = path.toString();
        return !pathStr.endsWith('index.js');
      });
      vi.mocked(discoverDependencies).mockResolvedValue({
        react: {
          name: 'react',
          version: '18.0.0',
          major: 18,
          minor: 0,
          patch: 0,
        },
      });
      vi.mocked(getDependencyList).mockReturnValue(['react']);

      const plugins = await loadPlugins(baseConfig);

      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.name).toBe('@stagewise-plugins/react');
      expect(plugins[0]?.available).toBe(false);
      expect(plugins[0]?.error).toContain('Plugin entry point not found');
    });

    it('should handle mixed available and unavailable plugins', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = path.toString();
        // Mock that the broken plugin's directory or index.js doesn't exist
        return !pathStr.includes('broken');
      });

      const config = {
        ...baseConfig,
        autoPlugins: false,
        plugins: [
          { name: '@local/working', path: './plugins/working' },
          { name: '@local/broken', path: './plugins/broken' },
          '@external/plugin',
        ],
      };

      const plugins = await loadPlugins(config);

      expect(plugins).toHaveLength(3);
      expect(plugins[0]?.available).toBe(true);
      expect(plugins[1]?.available).toBe(false);
      expect(plugins[2]?.available).toBe(true); // External plugins are always available
    });
  });

  describe('generatePluginImportMapEntries', () => {
    it('should generate entries for external URLs', () => {
      const plugins: Plugin[] = [
        {
          name: '@plugin/one',
          url: 'https://esm.sh/@plugin/one',
          available: true,
        },
        {
          name: '@plugin/two',
          url: 'https://custom.com/plugin.js',
          available: true,
        },
      ];

      const entries = generatePluginImportMapEntries(plugins);

      expect(entries).toEqual({
        'plugin-entry-0': 'https://esm.sh/@plugin/one',
        'plugin-entry-1': 'https://custom.com/plugin.js',
      });
    });

    it('should exclude unavailable plugins from import map', () => {
      const plugins: Plugin[] = [
        {
          name: '@plugin/one',
          url: 'https://esm.sh/@plugin/one',
          available: true,
        },
        {
          name: '@plugin/broken',
          path: '/broken/path',
          available: false,
          error: 'Not found',
        },
        {
          name: '@plugin/two',
          url: 'https://custom.com/plugin.js',
          available: true,
        },
      ];

      const entries = generatePluginImportMapEntries(plugins);

      expect(entries).toEqual({
        'plugin-entry-0': 'https://esm.sh/@plugin/one',
        'plugin-entry-1': 'https://custom.com/plugin.js',
      });
      expect(Object.keys(entries)).toHaveLength(2);
    });

    it('should generate entries for local paths', () => {
      const plugins: Plugin[] = [
        { name: '@local/plugin', path: '/path/to/plugin', available: true },
        { name: 'simple-plugin', path: '/another/path', available: true },
      ];

      const entries = generatePluginImportMapEntries(plugins);

      expect(entries).toEqual({
        'plugin-entry-0':
          '/stagewise-toolbar-app/plugins/-local-plugin/index.js',
        'plugin-entry-1':
          '/stagewise-toolbar-app/plugins/simple-plugin/index.js',
      });
    });

    it('should handle mixed external and local plugins', () => {
      const plugins: Plugin[] = [
        {
          name: '@external/plugin',
          url: 'https://esm.sh/@external/plugin',
          available: true,
        },
        { name: '@local/plugin', path: '/local/path', available: true },
      ];

      const entries = generatePluginImportMapEntries(plugins);

      expect(entries).toEqual({
        'plugin-entry-0': 'https://esm.sh/@external/plugin',
        'plugin-entry-1':
          '/stagewise-toolbar-app/plugins/-local-plugin/index.js',
      });
    });
  });

  describe('getPluginNames', () => {
    it('should extract plugin names', () => {
      const plugins: Plugin[] = [
        { name: '@plugin/one', url: 'https://esm.sh/@plugin/one' },
        { name: '@plugin/two', path: '/local/path' },
        { name: 'simple-plugin', url: 'https://cdn.com/plugin.js' },
      ];

      const names = getPluginNames(plugins);

      expect(names).toEqual(['@plugin/one', '@plugin/two', 'simple-plugin']);
    });

    it('should return empty array for no plugins', () => {
      const names = getPluginNames([]);
      expect(names).toEqual([]);
    });
  });
});
