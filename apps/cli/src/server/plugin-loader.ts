import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { log } from '../utils/logger.js';
import type { Config } from '../config/types.js';
import {
  discoverDependencies,
  getDependencyList,
} from '../dependency-parser/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Plugin {
  name: string;
  url?: string;
  path?: string;
  error?: string;
  available?: boolean;
}

interface DependencyMatcher {
  plugin: string;
  dependencies: Record<string, string>; // dependency name -> version range (* means any)
}

// Bundled plugins that are always served locally
const BUNDLED_PLUGINS = [
  '@stagewise-plugins/react',
  '@stagewise-plugins/angular',
  '@stagewise-plugins/vue',
];

// Dummy lookup table for matching dependencies to plugins
const DEPENDENCY_MATCHERS: DependencyMatcher[] = [
  {
    plugin: '@stagewise-plugins/react',
    dependencies: {
      react: '*',
      'react-dom': '*',
      next: '*',
    },
  },
  {
    plugin: '@stagewise-plugins/angular',
    dependencies: {
      '@angular/core': '*',
      '@angular/common': '*',
      '@angular/platform-browser': '*',
    },
  },
  {
    plugin: '@stagewise-plugins/vue',
    dependencies: {
      vue: '*',
      '@vue/runtime-core': '*',
      '@vue/runtime-dom': '*',
      nuxt: '*',
    },
  },
];

/**
 * Matches installed dependencies against the lookup table to determine which plugins to load
 */
function matchDependenciesToPlugins(installedDeps: Set<string>): Set<string> {
  const matchedPlugins = new Set<string>();

  for (const matcher of DEPENDENCY_MATCHERS) {
    // Check if any of the dependencies in the matcher are installed
    const dependencyNames = Object.keys(matcher.dependencies);
    const hasMatchingDep = dependencyNames.some((dep) =>
      installedDeps.has(dep),
    );

    if (hasMatchingDep) {
      matchedPlugins.add(matcher.plugin);
      log.debug(
        `Matched plugin ${matcher.plugin} based on installed dependencies`,
      );
    }
  }

  return matchedPlugins;
}

/**
 * Gets the local path for bundled plugins
 */
function getBundledPluginPath(pluginName: string): string {
  const simpleName = pluginName.replace('@stagewise-plugins/', '');
  return process.env.NODE_ENV === 'production'
    ? resolve(__dirname, `plugins/${simpleName}`)
    : resolve(__dirname, `../../node_modules/${pluginName}/dist`);
}

/**
 * Validates if a plugin path exists and has an index.js file
 */
function validatePluginPath(pluginPath: string): {
  valid: boolean;
  error?: string;
} {
  if (!existsSync(pluginPath)) {
    return { valid: false, error: `Plugin directory not found: ${pluginPath}` };
  }

  const indexPath = resolve(pluginPath, 'index.js');
  if (!existsSync(indexPath)) {
    return {
      valid: false,
      error: `Plugin entry point not found: ${indexPath}`,
    };
  }

  return { valid: true };
}

/**
 * Loads plugins based on configuration and automatic dependency detection
 */
export async function loadPlugins(config: Config): Promise<Plugin[]> {
  const plugins: Map<string, Plugin> = new Map();

  // Step 1: Automatic plugin loading (if enabled)
  if (config.autoPlugins !== false) {
    log.debug('Auto-loading plugins based on dependencies');

    const dependencyMap = await discoverDependencies(config.dir);
    const dependencyNames = getDependencyList(dependencyMap);
    const installedDeps = new Set(dependencyNames);
    const autoPlugins = matchDependenciesToPlugins(installedDeps);

    for (const pluginName of autoPlugins) {
      // Check if this is a bundled plugin
      if (BUNDLED_PLUGINS.includes(pluginName)) {
        const pluginPath = getBundledPluginPath(pluginName);
        const validation = validatePluginPath(pluginPath);
        plugins.set(pluginName, {
          name: pluginName,
          path: pluginPath,
          available: validation.valid,
          error: validation.error,
        });
        if (!validation.valid) {
          log.warn(
            `Auto-detected plugin ${pluginName} is not available: ${validation.error}`,
          );
        }
      } else {
        plugins.set(pluginName, {
          name: pluginName,
          url: `https://esm.sh/${pluginName}`,
          available: true,
        });
      }
    }
  }

  // Step 2: Manual plugin loading from config
  if (config.plugins && config.plugins.length > 0) {
    log.debug(`Loading ${config.plugins.length} plugins from config`);

    for (const plugin of config.plugins) {
      if (typeof plugin === 'string') {
        // Simple string format
        if (BUNDLED_PLUGINS.includes(plugin)) {
          const pluginPath = getBundledPluginPath(plugin);
          const validation = validatePluginPath(pluginPath);
          plugins.set(plugin, {
            name: plugin,
            path: pluginPath,
            available: validation.valid,
            error: validation.error,
          });
          if (!validation.valid) {
            log.warn(
              `Configured plugin ${plugin} is not available: ${validation.error}`,
            );
          }
        } else {
          plugins.set(plugin, {
            name: plugin,
            url: `https://esm.sh/${plugin}`,
            available: true,
          });
        }
      } else {
        console.log(plugin);
        // Object format with custom path/url
        const pluginObj: Plugin = {
          name: plugin.name,
        };

        if (plugin.url) {
          pluginObj.url = plugin.url;
        } else if (plugin.path) {
          // Local path - will be served by the dev server
          const resolvedPath = resolve(plugin.path);
          const validation = validatePluginPath(resolvedPath);
          pluginObj.path = resolvedPath;
          pluginObj.available = validation.valid;
          pluginObj.error = validation.error;
          if (!validation.valid) {
            log.warn(
              `Configured plugin ${plugin.name} is not available: ${validation.error}`,
            );
          }
        } else if (BUNDLED_PLUGINS.includes(plugin.name)) {
          // Bundled plugin - use local path
          const pluginPath = getBundledPluginPath(plugin.name);
          const validation = validatePluginPath(pluginPath);
          pluginObj.path = pluginPath;
          pluginObj.available = validation.valid;
          pluginObj.error = validation.error;
          if (!validation.valid) {
            log.warn(
              `Bundled plugin ${plugin.name} is not available: ${validation.error}`,
            );
          }
        } else {
          // Default to esm.sh
          pluginObj.url = `https://esm.sh/${plugin.name}`;
          pluginObj.available = true;
        }

        plugins.set(plugin.name, pluginObj);
      }
    }
  }

  const pluginList = Array.from(plugins.values());
  const unavailableCount = pluginList.filter(
    (p) => p.available === false,
  ).length;

  if (unavailableCount > 0) {
    log.warn(`Couldn't load ${unavailableCount} plugins`);
  }

  return pluginList;
}

/**
 * Generates plugin entries for the import map
 */
export function generatePluginImportMapEntries(
  plugins: Plugin[],
): Record<string, string> {
  const entries: Record<string, string> = {};

  // Only include available plugins in the import map
  const availablePlugins = plugins.filter((p) => p.available !== false);

  availablePlugins.forEach((plugin, index) => {
    const entryName = `plugin-entry-${index}`;

    if (plugin.url) {
      // External URL (including esm.sh)
      entries[entryName] = plugin.url;
    } else if (plugin.path) {
      // Local path - served by dev server
      const pluginName = plugin.name.replace(/[@/]/g, '-');
      entries[entryName] =
        `/stagewise-toolbar-app/plugins/${pluginName}/index.js`;
    }
  });

  return entries;
}

/**
 * Gets the list of plugin names for config generation
 */
export function getPluginNames(plugins: Plugin[]): string[] {
  return plugins.map((p) => p.name);
}
