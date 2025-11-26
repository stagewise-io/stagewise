/**
 * This file contains the workspace config service class.
 * The workspace config service loads the config file in the workspace and also offers a way to update the config.
 * When the config doesn't exist, the instantiation of this service will fail with an error "ConfigNotExistingException".
 */

import type { Logger } from '@/services/logger';
import type { KartonService } from '@/services/karton';
import type { WorkspaceConfigService } from './config';
import type { KartonContract } from '@shared/karton-contracts/ui';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StaticAnalysisService } from './static-analysis';
import type { NotificationService } from '@/services/notification';

// This is the default URL prefix for plugins that are just loaded by name.
const DEFAULT_PLUGIN_CDN_URL = 'https://esm.sh/';

type WorkspacePlugin = NonNullable<
  NonNullable<KartonContract['state']['workspace']>['plugins']
>[number];

type BuiltInPlugin = {
  name: string;
  path: string;
  dependencyMatcher: {
    packageJson: string[] | null; // A list of package names that trigger this plugin
  };
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*
const BuiltInPlugins: BuiltInPlugin[] = [
  {
    name: 'react',
    path:
      process.env.NODE_ENV === 'production'
        ? resolve(__dirname, `plugins/react`)
        : resolve(
            __dirname,
            `../../node_modules/@stagewise-plugins/react/dist`,
          ),
    dependencyMatcher: {
      packageJson: ['react', 'react-dom', 'react-router', 'next'],
    },
  },
  {
    name: 'vue',
    path:
      process.env.NODE_ENV === 'production'
        ? resolve(__dirname, `plugins/vue`)
        : resolve(__dirname, `../../node_modules/@stagewise-plugins/vue/dist`),
    dependencyMatcher: {
      packageJson: ['vue', 'vue-router', 'vue-i18n', 'nuxt'],
    },
  },
  {
    name: 'angular',
    path:
      process.env.NODE_ENV === 'production'
        ? resolve(__dirname, `plugins/angular`)
        : resolve(
            __dirname,
            `../../node_modules/@stagewise-plugins/angular/dist`,
          ),
    dependencyMatcher: {
      packageJson: [
        '@angular/core',
        '@angular/common',
        '@angular/router',
        '@angular/cli',
      ],
    },
  },
];
*/

export class WorkspacePluginService {
  private logger: Logger;
  private kartonService: KartonService;
  private workspaceConfigService: WorkspaceConfigService;
  private staticAnalysisService: StaticAnalysisService;
  private notificationService: NotificationService;
  private _configuredPlugins: WorkspacePlugin[] = [];

  private constructor(
    logger: Logger,
    kartonService: KartonService,
    workspaceConfigService: WorkspaceConfigService,
    staticAnalysisService: StaticAnalysisService,
    notificationService: NotificationService,
  ) {
    this.logger = logger;
    this.kartonService = kartonService;
    this.workspaceConfigService = workspaceConfigService;
    this.staticAnalysisService = staticAnalysisService;
    this.notificationService = notificationService;
  }

  private async initialize(): Promise<void> {
    this.logger.debug('[WorkspacePluginService] Initializing...');

    // Initialize the plugin system
    await this.initPluginSystem();

    this.logger.debug('[WorkspacePluginService] Initialized');
  }

  public static async create(
    logger: Logger,
    kartonService: KartonService,
    workspaceConfigService: WorkspaceConfigService,
    staticAnalysisService: StaticAnalysisService,
    notificationService: NotificationService,
  ): Promise<WorkspacePluginService> {
    const instance = new WorkspacePluginService(
      logger,
      kartonService,
      workspaceConfigService,
      staticAnalysisService,
      notificationService,
    );
    await instance.initialize();

    // Register a config change listener that checks if the plugin list has changed and should be re-initialized
    workspaceConfigService.addConfigUpdatedListener((newConfig, oldConfig) => {
      if (
        !oldConfig ||
        oldConfig.plugins !== newConfig.plugins ||
        oldConfig.autoPlugins !== newConfig.autoPlugins
      ) {
        void instance.initPluginSystem();
      }
    });

    return instance;
  }

  public async teardown(): Promise<void> {
    this.logger.debug('[WorkspacePluginService] Teardown called');
    this._configuredPlugins = [];
  }

  /**
   * Initializes the plugin system based on the configuration.
   *
   * This has to be triggered manually when a change to the plugins that should be loaded has been made.
   */
  public async initPluginSystem() {
    // TODO Depending on the config, auto load plugins based on the workspace
    const recommendedBuiltInPlugins =
      (this.workspaceConfigService.get().autoPlugins ?? true)
        ? await this.getRecommendedBundledPlugins()
        : [];

    // TODO Manually load all plugins based on the config, resolve them based on their format
    const manualPlugins = this.workspaceConfigService.get().plugins ?? [];

    const allPlugins = [
      ...recommendedBuiltInPlugins.map((p) => ({
        name: p.name,
        bundled: true,
        path: p.path,
        available: true,
        error: undefined,
      })),
      ...manualPlugins.map((p) =>
        typeof p === 'string'
          ? {
              name: p,
              bundled: false,
              url: `${DEFAULT_PLUGIN_CDN_URL}${p}`,
              available: false,
              error: undefined,
            }
          : p.path
            ? {
                name: p.name,
                bundled: false,
                path: p.path,
                url: undefined,
                available: false,
                error: undefined,
              }
            : {
                name: p.name,
                bundled: false,
                path: undefined,
                url: p.url!,
                available: false,
                error: undefined,
              },
      ),
    ];

    // Check for naming collisions
    const namingCollisions = allPlugins.filter((p) =>
      allPlugins.some((p2) => p !== p2 && p.name === p2.name),
    );
    if (namingCollisions.length > 0) {
      this.notificationService.showNotification({
        title: 'Multiple plugins with the same name were loaded',
        message: `Loaded plugins: ["${namingCollisions.map((p) => p.name).join('", "')}"]`,
        type: 'error',
        actions: [],
        duration: 30000,
      });
      throw new Error(
        `Multiple plugins with the same name were loaded. Loaded plugins: ["${namingCollisions.map((p) => p.name).join('", "')}"]`,
      );
    }

    // Check for availability of the plugins
    this._configuredPlugins =
      await this.getAvailabilityCheckedPlugins(allPlugins);

    this.logger.debug(
      `[WorkspacePluginService] Loaded plugins: ${JSON.stringify(this._configuredPlugins, null, 2)}`,
    );

    this.kartonService.setState((draft) => {
      draft.workspace!.plugins = this._configuredPlugins.filter(
        (p) => p.available,
      );
    });
  }

  async getRecommendedBundledPlugins(): Promise<BuiltInPlugin[]> {
    this.logger.debug(
      '[WorkspacePluginService] Getting recommended bundled plugins...',
    );

    // Based on all supported heuristics, return the list of recommended bundled plugins
    const recommendedPlugins: BuiltInPlugin[] = [];

    // package.json heuristic: combine all dependnencies of all package.json files in the the workspace and check if some plugins match these dependencies
    /*
    const allDependencies = this.staticAnalysisService.nodeDependencies;
    
    for (const plugin of BuiltInPlugins) {
      if (plugin.dependencyMatcher.packageJson) {
        if (
          plugin.dependencyMatcher.packageJson.some((d) =>
            Object.entries(allDependencies).some((d2) => d2[1].name === d),
          )
        ) {
          recommendedPlugins.push(plugin);
        }
      }
    }

    this.logger.debug(
      '[WorkspacePluginService] Recommended bundled plugins: ',
      BuiltInPlugins,
    );
    */

    return recommendedPlugins;
  }

  async getAvailabilityCheckedPlugins(
    plugins: WorkspacePlugin[],
  ): Promise<WorkspacePlugin[]> {
    // TODO Work through the list of plugins and see if they are reachable / exist based on the heuristics. Then, update the availability of the plugin.

    for (const plugin of plugins) {
      if ('path' in plugin) {
        // If the plugin has a path defined, check if the path exists and if the index.js file exists
        if (existsSync(path.join(plugin.path, 'index.js'))) {
          plugin.available = true;
        } else {
          plugin.available = false;
          plugin.error = `Plugin not found under given path: "${plugin.path}". Make sure that the path is correct and the index.js file exists.`;
          this.notificationService.showNotification({
            title: 'Plugin not found',
            message: plugin.error,
            type: 'warning',
            actions: [],
            duration: 30000,
          });
        }
      } else {
        // If the plugin has a url defined, check if the url is reachable and returns 200 status code
        const response = await fetch(plugin.url);
        if (response.status === 200) {
          plugin.available = true;
        } else {
          plugin.available = false;
          plugin.error = `Plugin not found under given url: "${plugin.url}". Status code: ${response.status}.`;
          this.notificationService.showNotification({
            title: 'Plugin not found',
            message: plugin.error,
            type: 'warning',
            actions: [],
            duration: 30000,
          });
        }
      }
    }

    // Return the plugins with the updated availability
    this.logger.debug(
      '[WorkspacePluginService] Availability checked plugins: ',
      plugins,
    );
    return plugins;
  }

  public get allPlugins(): WorkspacePlugin[] {
    return this._configuredPlugins;
  }

  public get loadedPlugins(): WorkspacePlugin[] {
    return this._configuredPlugins.filter((p) => p.available);
  }

  public get loadedPluginEntryPaths(): string[] {
    return this.loadedPlugins.map((p) => ('path' in p ? p.path : p.url));
  }
}
