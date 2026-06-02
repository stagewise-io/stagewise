/**
 * This file stores the main setup for the CLI.
 */

import { app, clipboard, dialog } from 'electron';
import { AuthService } from './services/auth';
import { AgentManagerService } from './services/agent-manager';
import { enrichHistoryEntryWorkspaces } from './services/agent-manager/history-workspace-enrichment';
import { UserExperienceService } from './services/experience';
import { FilePickerService } from './services/file-picker';
import { AppMenuService } from './services/app-menu';
import { URIHandlerService } from './services/uri-handler';
import { IdentifierService } from './services/identifier';
import { Logger } from './services/logger';
import {
  isUIEventName,
  parseUIEventProperties,
  TelemetryService,
} from './services/telemetry';
import { GlobalConfigService } from './services/global-config';
import { PreferencesService } from './services/preferences';
import { NotificationService } from './services/notification';
import { PagesService } from './services/pages';
import { NotificationSoundsService } from './services/notification-sounds';
import { WindowLayoutService } from './services/window-layout';
import { HistoryService } from './services/history';
import { FaviconService } from './services/favicon';
import { WebDataService } from './services/webdata';
import { AttachmentsService } from '@stagewise/agent-core/attachments';
import { AgentCorePersistence } from '@stagewise/agent-core/persistence';
import type { AgentManagerStartupPolicy } from '@stagewise/agent-core';
import { AgentTypes } from '@shared/karton-contracts/ui/agent';
import { AutoUpdateService } from './services/auto-update';
import { LocalPortsScannerService } from './services/local-ports-scanner';
import { DevToolAPIService } from './services/dev-tool-api';
import { OmniboxSuggestionsService } from './services/omnibox-suggestions';
import { ensureRipgrepInstalled } from '@stagewise/agent-runtime-node';
import { ToolboxService } from './services/toolbox';
import { GitService } from './services/git';
import {
  createAgentCoreSeam,
  attachAgentCoreBridge,
} from './services/agent-core-bridge/wiring';
import { registerToolboxGenerateWorkspaceMd } from './services/agent-core-bridge/handlers/toolbox';
import { createBrowserHostPaths } from './services/agent-core-bridge/host-paths';
import { createBrowserAgentHost } from './services/agent-core-bridge/host';
import { createLazyBrowserHostModels } from './services/agent-core-bridge/host-models';
import { createBrowserAgentTypeRegistry } from './agents/agents-registry';
import { CredentialsService } from './services/credentials';
import type { CredentialTypeId } from '@shared/credential-types';
import { ModelProviderService } from './agents/model-provider';
import { wirePagesStateSync } from './wiring/pages-state-sync';
import { wirePagesHandlers } from './wiring/pages-handler-wiring';
import {
  ensureDataDirectories,
  getPluginsPath,
  getBuiltinSkillsPath,
  getRipgrepBasePath,
} from './utils/paths';
import { migrateLegacyPaths } from './utils/migrate-legacy-paths';
import { readPersistedDataSync } from './utils/persisted-data';
import { z } from 'zod';
import { discoverPlugins } from './utils/discover-plugins';
import { discoverSkills } from './agents/shared/prompts/utils/get-skills';
import type { SkillDefinition } from '@shared/skills';
import { AssetCacheService } from './services/asset-cache';
import { detectShell, resolveShellEnv } from './utils/shell-env';
import path from 'node:path';
import { registerStartupUrlHandler } from './startup-url-events';
import type {
  HistoryFilter,
  HistoryResult,
  FaviconBitmapResult,
} from '@shared/karton-contracts/pages-api/types';
import {
  createAgentsMdDomainAdapter,
  createEnabledSkillsDomainAdapter,
  createFileDiffsDomainAdapter,
  createLogsDomainAdapter,
  createPlansDomainAdapter,
  createWorkspaceDomainAdapter,
  createWorkspaceMdDomainAdapter,
} from '@stagewise/agent-core/env/adapters';
import {
  createBrowserHostEnvironmentSources,
  registerHostEnvDomainAdapters,
} from './env-domains';

export type MainParameters = {
  launchOptions: {
    verbose?: boolean;
  };
};

export async function main({ launchOptions: { verbose } }: MainParameters) {
  // In this file you can include the rest of your app's specific main process
  // code. You can also put them in separate files and import them here.
  const logger = new Logger(verbose ?? false);

  migrateLegacyPaths(logger);

  await ensureDataDirectories();

  // Build the browser-backed `HostPaths` early (zero dependencies) so
  // every subsequent service that wants path resolution receives it as
  // an injected capability rather than importing `@/utils/paths`
  // directly. The full `AgentHost` is assembled later — once
  // `ModelProviderService`, `TelemetryService`, and the logger are all
  // available — right before `attachAgentCoreBridge`.
  const hostPaths = createBrowserHostPaths();

  // The `AttachmentsService` is stateless (it just wraps `HostPaths`),
  // so it can be constructed before the full `AgentHost` exists.
  // Construct one early so `WindowLayoutService` can register the
  // `attachment://` protocol handler against it; the same instance is
  // handed to `AgentCorePersistence.create` below.
  const attachments = new AttachmentsService(hostPaths);

  // Bootstrap every service that has no inter-dependencies in parallel.
  // These were previously awaited one-by-one, serializing independent
  // disk/DB I/O and needlessly delaying the first window paint. They all
  // only need `logger`, so they can be created concurrently. Services with
  // dependencies are created in level order just below.
  const [
    preferencesService,
    identifierService,
    webDataService,
    faviconService,
    localPortsScannerService,
  ] = await Promise.all([
    PreferencesService.create(logger),
    IdentifierService.create(logger),
    // WebDataService must exist before HistoryService (history keyword IDs
    // reference the keywords table owned by WebDataService).
    WebDataService.create(logger),
    FaviconService.create(logger),
    // LocalPortsScannerService discovers local dev servers.
    LocalPortsScannerService.create(logger),
  ]);

  // TelemetryService depends on identifier + preferences.
  const telemetryService = new TelemetryService(
    identifierService,
    preferencesService,
    logger,
  );

  // Start launch telemetry without blocking startup. TelemetryService keeps
  // track of the pending capture so shutdown can wait for it before emitting
  // app-closed.
  telemetryService.captureAppLaunched();

  // Global safety net: capture any unhandled errors/rejections to telemetry
  process.on('uncaughtException', (error) => {
    logger.error(`[Process] Uncaught exception: ${error.message}`);
    telemetryService.captureException(error, {
      service: 'process',
      operation: 'uncaughtException',
    });
  });
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error(`[Process] Unhandled rejection: ${error.message}`);
    telemetryService.captureException(error, {
      service: 'process',
      operation: 'unhandledRejection',
    });
  });

  // HistoryService depends on WebDataService (created above) + telemetry.
  const historyService = await HistoryService.create(
    logger,
    webDataService,
    telemetryService,
  );

  // Create PagesService early so it can be passed to WindowLayoutService
  const pagesService = await PagesService.create(
    logger,
    historyService,
    faviconService,
    telemetryService,
  );

  // Create WindowLayoutService with all dependencies including PreferencesService
  // This also applies the startup page preference during initialization
  const windowLayoutService = await WindowLayoutService.create(
    logger,
    historyService,
    faviconService,
    pagesService,
    preferencesService,
    attachments,
    telemetryService,
  );
  const uiKarton = windowLayoutService.uiKarton;

  const detectedShell = detectShell();
  const resolvedEnvPromise = detectedShell
    ? resolveShellEnv(detectedShell)
    : Promise.resolve(null);
  const gitService = await GitService.create({
    logger,
    telemetryService,
    resolvedEnvPromise,
  });

  // Push search engine definitions to UI karton state.
  webDataService
    .getSearchEngines()
    .then((engines) => {
      uiKarton.setState((draft) => {
        draft.searchEngines = engines;
      });
      if (verbose)
        logger.debug(
          `[Main] Pushed ${engines.length} search engines to UI karton`,
        );
    })
    .catch((error) => {
      logger.warn('[Main] Failed to load search engines', error);
    });

  // Phase 3a: build the agent-core seam (store + controllers + registry)
  // early so services that consume store-canonical state — currently
  // `DiffHistoryService` via the store itself — can receive their
  // dependency as an injected capability. The bridge itself is attached
  // later, once `agentCoreHost` exists (post-ModelProviderService).
  const agentCoreSeam = createAgentCoreSeam({ karton: uiKarton });

  // Phase 5: assemble a partial `AgentHost` early so `DiffHistoryService`
  // (now a package-side service) can receive the host + store as
  // injected dependencies. `ModelProviderService` does not exist yet —
  // `createLazyBrowserHostModels()` returns a proxy whose `get()` throws
  // until `setModelProviderService(...)` is called further down. The
  // `DiffHistoryService` itself never consults `host.models`, so the
  // lazy slot is invisible in practice.
  const lazyHostModels = createLazyBrowserHostModels();
  const agentCoreHost = createBrowserAgentHost({
    logger,
    telemetryService,
    paths: hostPaths,
    models: lazyHostModels.hostModels,
  });

  // Push bundled plugin definitions to UI karton state
  discoverPlugins(getPluginsPath()).then((plugins) => {
    uiKarton.setState((draft) => {
      draft.plugins = plugins;
    });
    if (verbose)
      logger.debug(
        `[Main] Pushed ${plugins.length} bundled plugins to UI karton`,
      );
  });

  // Phase D.2: the host enumerates `AgentCorePersistence` once instead
  // of constructing each persistence service by name. The facade owns
  // construction order, schema-migration sequencing, and teardown for
  // `DiffHistoryService`, `FileReadCacheService`,
  // `ProcessedImageCacheService`, `AttachmentsService`, and
  // `AgentPersistenceDB`. `attachments` is passed in so we share the
  // already-constructed instance with `WindowLayoutService`.
  const persistence = await AgentCorePersistence.create({
    host: agentCoreHost,
    store: agentCoreSeam.store,
    attachments,
  });
  const diffHistoryService = persistence.diffHistory;

  // Connect PreferencesService to Karton for reactive sync
  preferencesService.connectKarton(uiKarton, pagesService);

  // Create OmniboxSuggestionsService for omnibox autocomplete
  const _omniboxSuggestionsService = await OmniboxSuggestionsService.create(
    logger,
    uiKarton,
    historyService,
    webDataService,
    faviconService,
    localPortsScannerService,
  );

  // Set up URL handlers, capturing the auth callback registration function
  const registerAuthCallbackHandler = setupUrlHandlers(
    windowLayoutService,
    logger,
  );

  const notificationService = await NotificationService.create(
    logger,
    uiKarton,
  );

  // Initialize auto-update service (only runs on macOS and Windows, skipped for dev builds)
  const autoUpdateService = await AutoUpdateService.create(
    logger,
    notificationService,
    telemetryService,
    preferencesService,
    uiKarton,
  );

  const globalConfigService = await GlobalConfigService.create(
    logger,
    uiKarton,
  );

  // Resolve the sounds directory.
  // Packaged: extraResource copies leaf dirs directly into Resources/.
  // So ./assets/sounds → Resources/sounds/, NOT Resources/assets/sounds/.
  // Dev: app.getAppPath() = project root where assets/sounds/ exists.
  const soundsDir = app.isPackaged
    ? path.join(process.resourcesPath!, 'sounds')
    : path.join(app.getAppPath(), 'assets', 'sounds');
  const importedPacksDir = path.join(
    app.getPath('userData'),
    'imported-sound-packs',
  );

  const notificationSoundsService = await NotificationSoundsService.create(
    logger,
    uiKarton,
    soundsDir,
    importedPacksDir,
    globalConfigService.get(),
  );

  notificationSoundsService.setWindowRef(() =>
    windowLayoutService.getBaseWindow(),
  );
  notificationSoundsService.setWebContentsRef(() =>
    windowLayoutService.getUIWebContents(),
  );

  const notificationSoundsConfigListener: Parameters<
    typeof globalConfigService.addConfigUpdatedListener
  >[0] = (newConfig) => {
    notificationSoundsService.onConfigUpdated(newConfig);
  };
  globalConfigService.addConfigUpdatedListener(
    notificationSoundsConfigListener,
  );

  const syncAvailableSoundPacks = async (
    selectedPack?: string,
  ): Promise<void> => {
    const cfg = globalConfigService.get();
    const packs = notificationSoundsService.listPacks();
    const displayNames = notificationSoundsService.getPackDisplayNames();
    const packsChanged =
      cfg.availableSoundPacks.length !== packs.length ||
      !cfg.availableSoundPacks.every((p, i) => p === packs[i]);
    const namesChanged =
      Object.keys(cfg.packDisplayNames).length !==
        Object.keys(displayNames).length ||
      Object.entries(displayNames).some(
        ([id, name]) => cfg.packDisplayNames[id] !== name,
      );

    if (!packsChanged && !namesChanged && !selectedPack) return;

    await globalConfigService.set({
      ...cfg,
      availableSoundPacks: packs,
      packDisplayNames: displayNames,
      ...(selectedPack ? { notificationSoundPack: selectedPack } : {}),
    });
  };

  void syncAvailableSoundPacks().catch((err) => {
    logger.error('[Main] Failed to save discovered sound packs', err);
  });

  ensureRipgrepInstalled({
    rgBinaryBasePath: getRipgrepBasePath(),
    onLog: logger.debug,
  })
    .then((result) => {
      if (!result.success) {
        telemetryService.captureException(
          new Error(result.error ?? 'Unknown error'),
          { service: 'main', operation: 'ensureRipgrep' },
        );
        logger.warn(
          `Ripgrep installation failed: ${result.error}. Grep/glob operations will use slower Node.js implementations.`,
        );
      } else {
        if (verbose)
          logger.debug('Ripgrep is available for grep/glob operations');
      }
    })
    .catch((error) => {
      logger.warn(
        `Ripgrep installation failed: ${error}. Grep/glob operations will use slower Node.js implementations.`,
      );
      telemetryService.captureException(error as Error, {
        service: 'main',
        operation: 'ensureRipgrep',
      });
    });

  logger.debug('[Main] Global services bootstrapped');

  // Register telemetry capture RPC so the UI can send events through the backend
  uiKarton.registerServerProcedureHandler(
    'telemetry.capture',
    async (
      _cid: string,
      eventName: string,
      properties?: Record<string, unknown>,
    ) => {
      if (!isUIEventName(eventName)) {
        logger.warn(`[Main] Ignoring unknown UI telemetry event: ${eventName}`);
        return;
      }

      const parsedProperties = parseUIEventProperties(eventName, properties);
      if (parsedProperties === null) {
        logger.warn(
          `[Main] Ignoring invalid UI telemetry payload for event: ${eventName}`,
        );
        return;
      }

      telemetryService.capture(eventName, parsedProperties);
    },
  );

  // Start remaining services that are irrelevant to non-regular operation of the app.
  const filePickerService = await FilePickerService.create(logger, uiKarton);

  // DevToolAPIService handles devtools-related functionality and state
  const _devToolAPIService = await DevToolAPIService.create(
    logger,
    uiKarton,
    windowLayoutService,
  );

  // URIHandlerService registers the app as the default protocol client for stagewise://
  // URL handling is done in main.ts via setupUrlHandlers() and handleCommandLineUrls()
  await URIHandlerService.create(logger);

  const authService = await AuthService.create(
    identifierService,
    uiKarton,
    notificationService,
    logger,
  );

  // Wire auth callback handler so social sign-in / protocol URLs are
  // routed to AuthService instead of opened as browser tabs.
  registerAuthCallbackHandler((url) => authService.handleAuthCallbackUrl(url));

  const userExperienceService = await UserExperienceService.create(
    logger,
    uiKarton,
    telemetryService,
    gitService,
  );

  const credentialsService = await CredentialsService.create(logger);

  credentialsService.setAccessTokenProvider(() => authService.accessToken);

  const toolboxService = await ToolboxService.create(
    logger,
    uiKarton,
    diffHistoryService,
    windowLayoutService,
    authService,
    telemetryService,
    filePickerService,
    userExperienceService,
    credentialsService,
    gitService,
    preferencesService,
    detectedShell,
    resolvedEnvPromise,
    agentCoreSeam.store,
    agentCoreSeam.hostAgentStateMutations,
    attachments,
  );

  // Give DiffHistoryService a way to resolve workspace roots for the
  // gitignore-aware filter in `registerAgentEdit`. Evaluated lazily per
  // call, so the (still-async) MountManager initialization inside
  // ToolboxService does not need to be awaited before wiring.
  persistence.setMountPathsResolver(() => toolboxService.getAllMountedPaths());

  // Push bundled skill definitions via the toolbox so it can
  // merge them with workspace/plugin skills on mount changes.
  // Display order for builtin slash commands (unlisted ones sort last).
  const BUILTIN_ORDER: Record<string, number> = {
    plan: 0,
    debug: 1,
    preview: 2,
    learn: 3,
  };

  discoverSkills(getBuiltinSkillsPath()).then((skills) => {
    const builtins: SkillDefinition[] = skills
      .map((s) => ({
        id: `command:${s.name.toLowerCase()}`,
        displayName: s.name,
        description: s.description,
        source: 'builtin' as const,
        contentPath: `${s.path}/SKILL.md`,
        userInvocable: s.userInvocable,
        agentInvocable: s.agentInvocable,
      }))
      .sort(
        (a, b) =>
          (BUILTIN_ORDER[a.displayName.toLowerCase()] ?? 99) -
          (BUILTIN_ORDER[b.displayName.toLowerCase()] ?? 99),
      );
    toolboxService.setBuiltinSkills(builtins);
    if (verbose)
      logger.debug(
        `[Main] Pushed ${builtins.length} bundled skills to UI karton`,
      );
  });

  const _appMenuService = new AppMenuService(
    logger,
    authService,
    windowLayoutService,
  );

  const modelProviderService = new ModelProviderService(
    telemetryService,
    authService,
    preferencesService,
  );

  // Wire the model-provider into the toolbox so the shell tool can run the
  // smart-approval classifier on demand. Done here because
  // `ModelProviderService` depends on `preferencesService`, which is
  // constructed after the toolbox itself.
  toolboxService.setModelProviderService(modelProviderService);

  const assetCacheService = await AssetCacheService.create(
    () => authService.accessToken,
    logger,
  );

  const processedImageCacheService = persistence.processedImageCache;

  // Phase 4: a single app-wide `FileReadCacheService` backs every agent
  // instance so repeated reads of the same file across agents benefit
  // from a shared cache. Owned by `AgentCorePersistence` (Phase D.2).
  const fileReadCacheService = persistence.fileReadCache;

  const agentTypeRegistry = createBrowserAgentTypeRegistry();

  const electronAgentManagerStartupPolicy: AgentManagerStartupPolicy = {
    kind: 'auto-create-default',
    agentType: AgentTypes.CHAT,
    mountLastWorkspaces: true,
    // Restore the last-active agent on cold start instead of always
    // booting into a blank CHAT. `WindowLayoutService.loadTabState`
    // owns writing this id; we read the same file synchronously here
    // so the manager's startup policy can attempt a resume before
    // falling through to its create-default fall-back.
    getResumeAgentId: () => {
      const state = readPersistedDataSync(
        'tab-state',
        z.object({ lastOpenAgentId: z.string().nullable().catch(null) }),
        { lastOpenAgentId: null },
      );
      return state.lastOpenAgentId;
    },
  };

  const agentManagerService = new AgentManagerService(
    uiKarton,
    agentCoreSeam.registry,
    toolboxService,
    agentCoreSeam.store,
    () => uiKarton.state.skills ?? [],
    electronAgentManagerStartupPolicy,
    fileReadCacheService,
    attachments,
    persistence.agentDb,
    agentCoreHost,
    agentTypeRegistry,
    assetCacheService,
    processedImageCacheService,
    (event, agentId) =>
      notificationSoundsService.notifyAgentEvent(event, agentId),
    (entries) =>
      enrichHistoryEntryWorkspaces(
        entries,
        (workspacePath) => gitService.getMountedWorkspaceSummary(workspacePath),
        logger,
      ),
  );

  toolboxService.setWorkspaceLastUsedAtResolver(
    async (workspacePaths) =>
      (await persistence.agentDb.getWorkspaceLastUsedAtByPath(
        workspacePaths,
      )) ?? new Map(),
  );

  registerToolboxGenerateWorkspaceMd(agentCoreSeam.registry, uiKarton, {
    store: agentCoreSeam.store,
    generateWorkspaceMdForPath: (workspacePath) =>
      agentManagerService.generateWorkspaceMdForPath(workspacePath),
  });

  // Phase 5: now that `ModelProviderService` exists, activate the lazy
  // `HostModels` slot inside the already-assembled `agentCoreHost`. Must
  // happen before `attachAgentCoreBridge` so any attach-phase handler
  // that consults `host.models` sees a ready adapter.
  lazyHostModels.setModelProviderService(modelProviderService);

  // Phase 1c+1d+5: attach the bridge. Bridges every migrated Karton
  // procedure (`toolbox.dismissActiveApp`, `toolbox.clearPendingAppMessage`,
  // `toolbox.acceptHunks`, `toolbox.rejectHunks`) through the
  // `CommandRegistry`, and starts mirroring the AgentStore-canonical
  // `activeApp`, `pendingAppMessage`, `pendingFileDiffs`, `editSummary`,
  // and `workspace.mounts` slices into Karton for the UI.
  //
  // Must run AFTER every legacy service has finished registering its own
  // Karton handlers — the bridge's drift guard runs against the final
  // registry, and Karton rejects double-registrations. Handles are kept
  // alive for the host lifetime.
  const agentCoreBridge = attachAgentCoreBridge(agentCoreSeam, {
    host: agentCoreHost,
    diffHistory: diffHistoryService,
  });
  // Phase 1d: route `SandboxService` app-lifecycle writes through the
  // AgentStore-backed controller instead of Karton.
  toolboxService.setActiveAppController(agentCoreBridge.activeAppController);

  // Register every env-state {@link DomainAdapter} (core + host) on
  // the agent manager. Core adapters are wired here so `AgentManager`
  // stays host-agnostic; host adapters reuse the same `toolboxService`
  // closures previously used by the legacy environment providers.
  agentCoreHost.environmentSources = createBrowserHostEnvironmentSources({
    karton: uiKarton,
    toolbox: toolboxService,
  });
  const coreMountManager = toolboxService.getMountManager();
  if (!coreMountManager) {
    throw new Error(
      '[Main] toolboxService.getMountManager() returned null — mount manager must be initialized before env-state adapter wiring',
    );
  }
  agentManagerService.registerEnvAdapter(
    createWorkspaceDomainAdapter({
      host: agentCoreHost,
      mountManager: coreMountManager,
    }),
  );
  const workspaceMdRelativePath = agentCoreHost.workspaceMdRelativePath?.();
  agentManagerService.registerEnvAdapter(
    createAgentsMdDomainAdapter({
      host: agentCoreHost,
      mountManager: coreMountManager,
      workspaceMdRelativePath,
    }),
  );
  agentManagerService.registerEnvAdapter(
    createWorkspaceMdDomainAdapter({
      mountManager: coreMountManager,
      workspaceMdRelativePath,
    }),
  );
  agentManagerService.registerEnvAdapter(
    createEnabledSkillsDomainAdapter({
      host: agentCoreHost,
      getSkillDetails: async (agentInstanceId) => {
        const skills = await toolboxService.getSkillsList(agentInstanceId);
        return new Map(
          skills
            .filter((s) => s.agentInvocable !== false && s.skillPath)
            .map((s) => [
              s.skillPath as string,
              {
                name: s.displayName,
                description: s.description,
                path: s.skillPath as string,
              },
            ]),
        );
      },
    }),
  );
  agentManagerService.registerEnvAdapter(
    createPlansDomainAdapter({
      host: agentCoreHost,
      store: agentCoreSeam.store,
    }),
  );
  agentManagerService.registerEnvAdapter(
    createLogsDomainAdapter({
      host: agentCoreHost,
      store: agentCoreSeam.store,
    }),
  );
  agentManagerService.registerEnvAdapter(
    createFileDiffsDomainAdapter({ store: agentCoreSeam.store }),
  );

  registerHostEnvDomainAdapters(agentManagerService, {
    karton: uiKarton,
    store: agentCoreSeam.store,
    getShellSnapshot: (agentInstanceId) =>
      toolboxService.getShellSnapshot(agentInstanceId),
    getShellInfo: () => {
      const info = toolboxService.getShellInfo();
      if (!info) return null;
      return { platform: process.platform, type: info.type, path: info.path };
    },
    getSandboxSessionId: (agentInstanceId) =>
      toolboxService.getSandboxSessionId(agentInstanceId),
    getLogIngestSnapshot: () => toolboxService.getLogIngestSnapshot(),
  });

  // Wire all uiKarton-to-pages state syncs (pending edits, mounts,
  // workspace-md generating, search engines, global config, auth)
  await wirePagesStateSync({
    uiKarton,
    pagesService,
    globalConfigService,
    logger,
  });

  // Wire all pages-api handler setters (pending edits accept/reject,
  // context files, certificate trust, auth, home page, etc.)
  wirePagesHandlers({
    uiKarton,
    pagesService,
    diffHistoryService,
    windowLayoutService,
    logger,
  });

  // Wire permission-exceptions clear handler (used by clearBrowsingData)
  pagesService.setClearPermissionExceptionsHandler(() =>
    preferencesService.clearAllPermissionExceptionsForAllTypes(),
  );

  // --- Wire main UI settings RPC procedures ---

  uiKarton.registerServerProcedureHandler(
    'config.previewSoundPack',
    async (
      _cid: string,
      packId: string,
      loudness: 'off' | 'subtle' | 'default',
    ) => ({
      ok: await notificationSoundsService.previewPackDoneSound(
        packId,
        loudness,
      ),
    }),
  );

  uiKarton.registerServerProcedureHandler(
    'config.importSoundPack',
    async () => {
      const result = await dialog.showOpenDialog({
        title: 'Use Custom Sound',
        filters: [
          { name: 'Sound files', extensions: ['mp3', 'json'] },
          { name: 'MP3 audio', extensions: ['mp3'] },
          { name: 'Sound pack JSON', extensions: ['json'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { error: '' };
      }

      const imported = await notificationSoundsService.importPack(
        result.filePaths[0],
      );
      if ('error' in imported) return imported;

      try {
        await syncAvailableSoundPacks(imported.id);
      } catch (err) {
        logger.error('[Main] Failed to save imported sound pack', err);
        return {
          error: 'Sound pack imported, but saving the selection failed.',
        };
      }

      return imported;
    },
  );

  // browser.addSearchEngine / removeSearchEngine
  uiKarton.registerServerProcedureHandler(
    'browser.addSearchEngine',
    async (
      _cid: string,
      input: { name: string; url: string; keyword: string },
    ) => {
      const id = await webDataService.addSearchEngine(input);
      await webDataService.getSearchEngines().then((engines) => {
        uiKarton.setState((draft) => {
          draft.searchEngines = engines;
        });
      });
      return { id, success: true };
    },
  );
  uiKarton.registerServerProcedureHandler(
    'browser.removeSearchEngine',
    async (_cid: string, id: number) => {
      const removed = await webDataService.removeSearchEngine(id);
      await webDataService.getSearchEngines().then((engines) => {
        uiKarton.setState((draft) => {
          draft.searchEngines = engines;
        });
      });
      return { success: removed };
    },
  );

  // browser.copyText - write text to the system clipboard from the main
  // process. The UI renderer's navigator.clipboard rejects when focus is
  // inside a web-content view, so clipboard writes are routed through here.
  uiKarton.registerServerProcedureHandler(
    'browser.copyText',
    async (_cid: string, text: string) => {
      clipboard.writeText(text);
    },
  );

  // browser.clearBrowsingData
  uiKarton.registerServerProcedureHandler(
    'browser.clearBrowsingData',
    async (
      _cid: string,
      options: Parameters<typeof pagesService.clearBrowsingData>[0],
    ) => {
      return pagesService.clearBrowsingData(options);
    },
  );

  // browser.getHistory / browser.getFaviconBitmaps (history settings section)
  uiKarton.registerServerProcedureHandler(
    'browser.getHistory',
    async (_cid: string, filter: HistoryFilter): Promise<HistoryResult[]> => {
      const results = await historyService.queryHistory(filter);
      const pageUrls = results.map((r) => r.url);
      const faviconMap = await faviconService.getFaviconsForUrls(pageUrls);
      return results.map((r) => ({
        ...r,
        faviconUrl: faviconMap.get(r.url) ?? null,
      }));
    },
  );
  uiKarton.registerServerProcedureHandler(
    'browser.getFaviconBitmaps',
    async (
      _cid: string,
      faviconUrls: string[],
    ): Promise<Record<string, FaviconBitmapResult>> => {
      const bitmapMap = await faviconService.getFaviconBitmaps(faviconUrls);
      const result: Record<string, FaviconBitmapResult> = {};
      for (const [url, bitmap] of bitmapMap) {
        result[url] = bitmap;
      }
      return result;
    },
  );

  // toolbox.getContextFiles / toolbox.generateWorkspaceMdForPath
  uiKarton.registerServerProcedureHandler(
    'toolbox.getContextFiles',
    async (_cid: string) => {
      return toolboxService.getContextFilesForAllWorkspaces();
    },
  );
  uiKarton.registerServerProcedureHandler(
    'toolbox.generateWorkspaceMdForPath',
    async (_cid: string, workspacePath: string) => {
      await agentManagerService.generateWorkspaceMdForPath(workspacePath);
    },
  );

  // userAccount.getUsageCurrent / getUsageHistory
  uiKarton.registerServerProcedureHandler(
    'userAccount.getUsageCurrent',
    async (_cid: string) => {
      return authService.getUsageCurrent();
    },
  );
  uiKarton.registerServerProcedureHandler(
    'userAccount.getUsageHistory',
    async (_cid: string, params: { days?: number }) => {
      return authService.getUsageHistory(params.days);
    },
  );

  // credentials.set / credentials.delete / credentials.getConfiguredIds
  uiKarton.registerServerProcedureHandler(
    'credentials.set',
    async (_cid: string, typeId: string, data: Record<string, string>) => {
      await credentialsService.set(
        typeId as CredentialTypeId,
        data as Parameters<typeof credentialsService.set>[1],
      );
    },
  );
  uiKarton.registerServerProcedureHandler(
    'credentials.delete',
    async (_cid: string, typeId: string) => {
      await credentialsService.delete(typeId as CredentialTypeId);
    },
  );
  uiKarton.registerServerProcedureHandler(
    'credentials.getConfiguredIds',
    async (_cid: string) => {
      return credentialsService.listConfigured();
    },
  );

  logger.debug('[Main] Normal operation services bootstrapped');

  logger.debug('[Main] Startup complete');

  // Handle command line arguments for URLs on initial startup
  handleCommandLineUrls(process.argv, windowLayoutService, logger, (url) =>
    authService.handleAuthCallbackUrl(url),
  );

  // Set up graceful shutdown to clean up database connections
  let isShuttingDown = false;
  const shutdown = (event: Electron.Event) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    event.preventDefault();

    const runTeardown = (name: string, teardown: () => void) => {
      try {
        teardown();
      } catch (error) {
        logger.warn(`[Main] Failed to teardown ${name}`, error);
      }
    };

    const exitApp = () => {
      logger.debug('[Main] Services shut down');
      app.exit(0);
    };

    try {
      logger.debug('[Main] Shutting down services...');
      runTeardown('localPortsScannerService', () =>
        localPortsScannerService.teardown(),
      );
      runTeardown('webDataService', () => webDataService.teardown());
      runTeardown('historyService', () => historyService.teardown());
      runTeardown('faviconService', () => faviconService.teardown());
      runTeardown('diffHistoryService', () => diffHistoryService.teardown());
      runTeardown('agentCorePersistence', () => persistence.teardown());
      runTeardown('assetCacheService', () => assetCacheService.teardown());
      runTeardown('autoUpdateService', () => autoUpdateService.teardown());

      // Shared budget for async teardowns. Toolbox teardown kills live
      // PTY sessions before Node env teardown begins — this is what
      // prevents the node-pty ThreadSafeFunction crash during
      // app.exit(). Telemetry flush is parallelised under the same cap.
      const SHUTDOWN_BUDGET_MS = 1000;

      const runAsyncTeardown = (name: string, fn: () => Promise<void> | void) =>
        Promise.resolve()
          .then(() => fn())
          .catch((error) => {
            logger.warn(`[Main] Failed to teardown ${name}`, error);
          });

      const asyncTeardowns = Promise.all([
        runAsyncTeardown('toolboxService', () => toolboxService.teardown()),
        runAsyncTeardown('telemetryService', () => telemetryService.teardown()),
      ]);

      void Promise.race([
        asyncTeardowns,
        new Promise<void>((resolve) => {
          setTimeout(resolve, SHUTDOWN_BUDGET_MS);
        }),
      ]).finally(() => {
        // Defer `app.exit(0)` one event-loop turn to give libuv a final
        // chance to drain any pending ThreadSafeFunction calls before
        // Electron starts FreeEnvironment. Defense-in-depth; cannot
        // deadlock because `exitApp` runs unconditionally.
        setImmediate(exitApp);
      });
    } catch (error) {
      logger.error(`[Main] Shutdown failed: ${String(error)}`);
      exitApp();
    }
  };

  app.on('will-quit', shutdown);
}

/**
 * Checks if a string is a valid URL that the browser can open
 */
function isOpenableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'stagewise:' ||
      parsed.protocol === 'stagewise-prerelease:' ||
      parsed.protocol === 'stagewise-nightly:' ||
      parsed.protocol === 'stagewise-dev:'
    );
  } catch {
    return false;
  }
}

/**
 * Extracts URLs from command line arguments (http, https, or stagewise://)
 */
function extractUrlsFromArgs(argv: string[]): string[] {
  const urls: string[] = [];
  for (const arg of argv) {
    // Skip non-URL arguments (flags starting with -)
    if (arg.startsWith('-')) {
      continue;
    }
    if (isOpenableUrl(arg)) {
      urls.push(arg);
    }
  }
  return urls;
}

type AuthCallbackHandler = (url: string) => boolean | Promise<boolean>;
const MAX_QUEUED_AUTH_CALLBACK_URLS = 5;

function isAuthCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'stagewise:' &&
      parsed.protocol !== 'stagewise-prerelease:' &&
      parsed.protocol !== 'stagewise-nightly:' &&
      parsed.protocol !== 'stagewise-dev:'
    ) {
      return false;
    }
    // Auth callback URLs have /auth in the path.
    // Normalize: stagewise://auth/callback → hostname='auth', pathname='/callback',
    // so reconstruct the full path the same way auth/index.ts does.
    const callbackPath = parsed.hostname
      ? `/${parsed.hostname}${parsed.pathname}`
      : parsed.pathname;
    return callbackPath.includes('/auth');
  } catch {
    return false;
  }
}

function describeIncomingUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (isAuthCallbackUrl(url)) return 'auth callback';
    return `${parsed.protocol}//${parsed.host || '(no-host)'}`;
  } catch {
    return 'unparseable URL';
  }
}

function handleAuthCallbackUrl(
  url: string,
  logger: Logger,
  authCallbackHandler: AuthCallbackHandler,
): void {
  void Promise.resolve(authCallbackHandler(url)).catch((error) => {
    logger.error(`[Main] Auth callback handling failed: ${String(error)}`);
  });
}

/**
 * Opens a URL in a new browser tab, routing auth callbacks to the handler.
 */
function openIncomingUrl(
  url: string,
  windowLayoutService: WindowLayoutService,
  logger: Logger,
  authCallbackHandler: AuthCallbackHandler | null,
  queueAuthCallbackUrl?: (url: string) => void,
): void {
  if (isAuthCallbackUrl(url)) {
    logger.debug('[Main] Received auth callback URL');
    if (authCallbackHandler) {
      handleAuthCallbackUrl(url, logger, authCallbackHandler);
    } else {
      queueAuthCallbackUrl?.(url);
    }
    return;
  }
  logger.debug(`[Main] Opening incoming URL: ${describeIncomingUrl(url)}`);
  void windowLayoutService.openUrlInNewTab(url);
}

/**
 * Sets up event handlers for opening URLs from OS events.
 * Returns a function to register the auth callback handler once AuthService is ready.
 */
function setupUrlHandlers(
  windowLayoutService: WindowLayoutService,
  logger: Logger,
): (handler: AuthCallbackHandler) => void {
  let authCallbackHandler: AuthCallbackHandler | null = null;
  const pendingAuthCallbackUrls: string[] = [];
  const queueAuthCallbackUrl = (url: string) => {
    if (pendingAuthCallbackUrls.length >= MAX_QUEUED_AUTH_CALLBACK_URLS) {
      pendingAuthCallbackUrls.shift();
    }
    pendingAuthCallbackUrls.push(url);
    logger.debug('[Main] Queued auth callback URL until handler is ready');
  };

  // Use registerStartupUrlHandler (installed in index.ts) to get all
  // open-url events, including those queued before main.ts runs.
  registerStartupUrlHandler((url) => {
    logger.debug(`[Main] open-url event received: ${describeIncomingUrl(url)}`);
    if (isOpenableUrl(url)) {
      openIncomingUrl(
        url,
        windowLayoutService,
        logger,
        authCallbackHandler,
        queueAuthCallbackUrl,
      );
    }
  });

  // Handle 'second-instance' event (when app is already running)
  app.on('second-instance', (_ev: Electron.Event, argv: string[]) => {
    logger.debug(
      `[Main] second-instance event received with ${argv.length} arguments`,
    );
    const urls = extractUrlsFromArgs(argv);
    for (const url of urls) {
      openIncomingUrl(
        url,
        windowLayoutService,
        logger,
        authCallbackHandler,
        queueAuthCallbackUrl,
      );
    }
  });

  return (handler: AuthCallbackHandler) => {
    authCallbackHandler = handler;
    const urls = pendingAuthCallbackUrls.splice(0);
    for (const url of urls) {
      handleAuthCallbackUrl(url, logger, handler);
    }
  };
}

/**
 * Handles URLs from command line arguments on initial startup.
 * Packaged protocol launches may pass the callback URL as argv[1]
 * without a script-path argument, so we scan all of argv.
 */
function handleCommandLineUrls(
  argv: string[],
  windowLayoutService: WindowLayoutService,
  logger: Logger,
  authCallbackHandler: AuthCallbackHandler | null,
): void {
  const urls = extractUrlsFromArgs(argv);
  if (urls.length > 0) {
    logger.debug(
      `[Main] Found ${urls.length} URLs in command line arguments: ${urls
        .map(describeIncomingUrl)
        .join(', ')}`,
    );
    // Open the first URL immediately, others will be queued
    openIncomingUrl(urls[0], windowLayoutService, logger, authCallbackHandler);
    // Open remaining URLs after a short delay to ensure the first one is processed
    for (let i = 1; i < urls.length; i++) {
      setTimeout(() => {
        openIncomingUrl(
          urls[i],
          windowLayoutService,
          logger,
          authCallbackHandler,
        );
      }, i * 100);
    }
  }
}
