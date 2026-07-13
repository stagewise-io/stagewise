import { applyPatches, enablePatches, type Patch } from 'immer';
import type { Logger } from './logger';
import type { KartonService } from './karton';
import type { PagesService } from './pages';
import {
  type UserPreferences,
  type ConfigurablePermissionType,
  type WidgetId,
  type DevToolbarOriginSettings,
  type ModelProvider,
  type ProviderInstance,
  type CustomEndpoint,
  type ApiSpec,
  type DiscoveredModel,
  userPreferencesSchema,
  defaultUserPreferences,
  PermissionSetting,
  configurablePermissionTypes,
  modelProviderSchema,
  PROVIDER_TYPE_DISPLAY_INFO,
  type ProviderInstanceTypeId,
  DEFAULT_WIDGET_ORDER,
  DEV_TOOLBAR_MAX_ORIGINS,
} from '@shared/karton-contracts/ui/shared-types';
import { readPersistedData, writePersistedData } from '../utils/persisted-data';
import { getJsonPath } from '../utils/paths';
import { DisposableService } from './disposable';
import { safeStorage } from 'electron';
import {
  CODING_PLANS,
  isCodingPlanId,
  type CodingPlanId,
} from '@shared/coding-plans';
import {
  validateApiKeys,
  validateCodingPlanApiKey,
  type ApiKeyValidationResult,
} from '../utils/validate-api-keys';
import { getProviderType } from '../agents/providers/registry';
import { computeDisabledModelIdsAfterDiscovery } from '@shared/flagship-models';

// Enable Immer patches support
enablePatches();

type PreferencesListener = (
  newPrefs: UserPreferences,
  oldPrefs: UserPreferences,
) => void;

/**
 * Service that manages user preferences with persistence and reactive Karton sync.
 *
 * Preferences are stored in preferences.json in the global data directory.
 * Updates are synced to both UI and Pages Karton contracts.
 *
 * ## Creating Patches (Client-side)
 *
 * Use Immer's `produceWithPatches` to create patches that describe your changes:
 *
 * ```typescript
 * import { produceWithPatches } from 'immer';
 *
 * // Get current preferences from Karton state
 * const currentPrefs = useKartonState((s) => s.preferences);
 *
 * // Create patches by describing mutations
 * const [nextState, patches, inversePatches] = produceWithPatches(currentPrefs, (draft) => {
 *   // Simple property change
 *   draft.privacy.telemetryLevel = 'full';
 *
 *   // Array operations (when preferences include arrays)
 *   // draft.someArray.push({ id: 1, name: 'new item' });
 *   // draft.someArray.splice(0, 1);  // remove first element
 *   // draft.someArray[0].name = 'updated';
 * });
 *
 * // patches is now a JSON-serializable array:
 * // [{ op: 'replace', path: ['privacy', 'telemetryLevel'], value: 'full' }]
 *
 * // Send patches to server via Karton procedure
 * await kartonProcedure('preferences.update', patches);
 *
 * // inversePatches can be used for undo functionality
 * ```
 *
 * ## Patch Structure
 *
 * Each patch is a JSON object with:
 * - `op`: 'replace' | 'add' | 'remove'
 * - `path`: Array of keys/indices to the target location
 * - `value`: The new value (not present for 'remove')
 *
 * Examples:
 * - `{ op: 'replace', path: ['privacy', 'telemetryLevel'], value: 'off' }`
 * - `{ op: 'add', path: ['someArray', 0], value: { id: 1 } }`
 * - `{ op: 'remove', path: ['someArray', 2] }`
 */
export class PreferencesService extends DisposableService {
  private readonly logger: Logger;
  private uiKarton: KartonService | null = null;
  private pagesService: PagesService | null = null;

  private preferences: UserPreferences = defaultUserPreferences;
  private listeners: PreferencesListener[] = [];
  private preferenceWriteQueue = Promise.resolve();

  private constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Create and initialize a new PreferencesService instance.
   * This only loads preferences from disk. Call connectKarton() to enable
   * reactive sync with UI and Pages Karton.
   */
  public static async create(logger: Logger): Promise<PreferencesService> {
    const instance = new PreferencesService(logger);
    await instance.initialize();
    return instance;
  }

  private async initialize(): Promise<void> {
    this.logger.debug('[PreferencesService] Initializing...');

    // Load preferences from disk
    this.preferences = await readPersistedData(
      'preferences',
      userPreferencesSchema,
      defaultUserPreferences,
    );

    // Migration: convert old customBaseUrl configs to customProviderId
    await this.migrateCustomBaseUrlToProviderId();
    // Migration: convert providerConfigs/customEndpoints into providerInstances
    await this.migrateToProviderInstances();

    this.logger.debug('[PreferencesService] Loaded preferences', {
      telemetryLevel: this.preferences.privacy.telemetryLevel,
    });

    this.logger.debug('[PreferencesService] Initialized');
  }

  /**
   * Migrate old `customBaseUrl` provider configs to the new `customProviderId` format.
   * For each provider in custom mode that has a customBaseUrl but no customProviderId,
   * create a custom endpoint and link to it.
   */
  private async migrateCustomBaseUrlToProviderId(): Promise<void> {
    const providers = [
      'anthropic',
      'openai',
      'google',
      'moonshotai',
      'alibaba',
      'deepseek',
      'z-ai',
      'minimax',
      'xiaomi-mimo',
      'mistral',
    ] as const;
    let needsSave = false;

    for (const provider of providers) {
      const config = this.preferences.providerConfigs[provider];
      if (
        config.mode === 'custom' &&
        config.customBaseUrl &&
        !config.customProviderId
      ) {
        const id = crypto.randomUUID();
        const apiSpecMap: Record<string, string> = {
          anthropic: 'anthropic',
          openai: 'openai-chat-completions',
          google: 'google',
        };

        this.preferences.customEndpoints.push({
          id,
          name: `Migrated ${provider} endpoint`,
          apiSpec: apiSpecMap[provider] as any,
          baseUrl: config.customBaseUrl,
          encryptedApiKey: config.encryptedApiKey,
          // Default value mirrors the Zod schema — only Bedrock reads it,
          // and the migration path only hits providers without Bedrock,
          // but the type makes the field required.
          awsAuthMode: 'access-keys',
        });

        config.customProviderId = id;
        config.customBaseUrl = undefined;
        config.encryptedApiKey = undefined;
        needsSave = true;

        this.logger.debug(
          `[PreferencesService] Migrated ${provider} customBaseUrl to endpoint ${id}`,
        );
      }
    }

    if (needsSave) {
      await this.save();
    }
  }

  /**
   * Migrate `providerConfigs` / `customEndpoints` into a flat
   * `providerInstances` array — the new single source of truth for routing.
   *
   * After migration each vendor maps to exactly one provider instance. The
   * `stagewise` instance is shared: vendors not otherwise assigned fall back
   * to it at routing time.
   *
   * Idempotent: if `providerInstances` is already populated this is a no-op.
   */
  private async migrateToProviderInstances(): Promise<void> {
    if (this.preferences.providerInstances.length > 0) return;

    const VENDORS: ModelProvider[] = [
      'anthropic',
      'openai',
      'google',
      'moonshotai',
      'alibaba',
      'deepseek',
      'z-ai',
      'minimax',
      'xiaomi-mimo',
      'mistral',
    ];
    const BUILT_IN_VENDOR_NAMES = new Set<string>(VENDORS);

    const instances: ProviderInstance[] = [];
    // vendor -> instance id that serves it (post-migration)
    const vendorToInstanceId = new Map<ModelProvider, string>();
    // endpoint ids consumed by a providerConfig custom-mode entry
    const consumedEndpointIds = new Set<string>();

    // 1. Seed the shared stagewise instance.
    instances.push({
      id: 'stagewise-default',
      typeId: 'stagewise',
      name: 'Stagewise Inference',
      config: {},
      enabledModelIds: [],
      disabledModelIds: [],
      discoveredModels: [],
    });

    // 2. Process providerConfigs.
    for (const vendor of VENDORS) {
      const cfg = this.preferences.providerConfigs[vendor];
      if (!cfg) continue;

      if (cfg.mode === 'stagewise') {
        vendorToInstanceId.set(vendor, 'stagewise-default');
        continue;
      }

      if (cfg.mode === 'official') {
        if (cfg.connectedCodingPlanId) {
          const plan = CODING_PLANS[cfg.connectedCodingPlanId];
          if (plan) {
            const id = `coding-plan:${cfg.connectedCodingPlanId}`;
            instances.push({
              id,
              typeId: 'coding-plan',
              name: plan.displayName,
              config: {
                encryptedApiKey: cfg.encryptedApiKey,
                planId: cfg.connectedCodingPlanId,
                baseUrl: plan.baseUrl,
              },
              enabledModelIds: [],
              disabledModelIds: [],
              discoveredModels: [],
            });
            vendorToInstanceId.set(vendor, id);
            continue;
          }
        }
        // Official API without a coding plan.
        const id = `${vendor}-api-default`;
        instances.push({
          id,
          typeId: `${vendor}-api`,
          name: PROVIDER_TYPE_DISPLAY_INFO[
            `${vendor}-api` as ProviderInstanceTypeId
          ].displayName,
          config: {
            encryptedApiKey: cfg.encryptedApiKey,
            baseUrl: undefined,
          },
          enabledModelIds: [],
          disabledModelIds: [],
          discoveredModels: [],
        });
        vendorToInstanceId.set(vendor, id);
        continue;
      }

      // mode === 'custom'
      if (cfg.customProviderId) {
        const endpoint = this.preferences.customEndpoints.find(
          (ep) => ep.id === cfg.customProviderId,
        );
        if (endpoint) {
          const instance = this.endpointToInstance(endpoint);
          instances.push(instance);
          vendorToInstanceId.set(vendor, instance.id);
          consumedEndpointIds.add(endpoint.id);
        }
      }
    }

    // 3. Process remaining custom endpoints not consumed above.
    for (const endpoint of this.preferences.customEndpoints) {
      if (consumedEndpointIds.has(endpoint.id)) continue;
      instances.push(this.endpointToInstance(endpoint));
    }

    // 5. Rewrite customModels: endpointId -> providerInstanceId.
    for (const model of this.preferences.customModels) {
      if (!model.providerInstanceId && model.endpointId) {
        if (BUILT_IN_VENDOR_NAMES.has(model.endpointId)) {
          model.providerInstanceId =
            vendorToInstanceId.get(model.endpointId as ModelProvider) ??
            'stagewise-default';
        } else {
          // Custom endpoint id — instance ids reuse endpoint ids.
          model.providerInstanceId = model.endpointId;
        }
      }
      model.endpointId = undefined;
    }

    // 4. Migrate global disabledModelIds → stagewise-default instance.
    //    All previously disabled models were implicitly on the stagewise
    //    route, so they map to the stagewise-default instance.
    //
    //    The global field was removed from the Zod schema, so we read
    //    it from the raw on-disk JSON instead of the parsed preferences.
    let legacyDisabled: string[] = [];
    try {
      const raw = JSON.parse(
        await import('node:fs/promises').then((fs) =>
          fs.readFile(getJsonPath('preferences'), 'utf-8'),
        ),
      ) as { agent?: { disabledModelIds?: string[] } };
      legacyDisabled = raw.agent?.disabledModelIds ?? [];
    } catch {
      // File doesn't exist or isn't valid JSON — nothing to migrate.
    }
    if (legacyDisabled.length > 0) {
      const stagewiseInstance = instances.find(
        (i) => i.id === 'stagewise-default',
      );
      if (stagewiseInstance) {
        stagewiseInstance.disabledModelIds = [
          ...new Set([
            ...stagewiseInstance.disabledModelIds,
            ...legacyDisabled,
          ]),
        ];
      }
    }

    this.preferences = {
      ...this.preferences,
      providerInstances: instances,
    };

    this.logger.debug(`[PreferencesService] Migrated to providerInstances`, {
      count: instances.length,
      vendorMap: Object.fromEntries(vendorToInstanceId),
    });
    await this.save();
  }

  /**
   * Convert a legacy `CustomEndpoint` into a `ProviderInstance`.
   * Reuses the endpoint id as the instance id to preserve custom-model
   * references.
   */
  private endpointToInstance(endpoint: CustomEndpoint): ProviderInstance {
    const apiSpecToTypeId: Record<ApiSpec, ProviderInstance['typeId']> = {
      anthropic: 'custom-anthropic',
      'openai-chat-completions': 'custom-openai-chat',
      'openai-responses': 'custom-openai-responses',
      google: 'custom-google',
      azure: 'azure',
      'amazon-bedrock': 'bedrock',
      'google-vertex': 'vertex',
    };
    const typeId = apiSpecToTypeId[endpoint.apiSpec];

    // Build the provider instance per typeId, copying only the fields
    // relevant to it. Each case constructs the full instance object so the
    // discriminated union narrows correctly.
    switch (typeId) {
      case 'custom-anthropic':
      case 'custom-openai-chat':
      case 'custom-openai-responses':
      case 'custom-google':
        return {
          id: endpoint.id,
          typeId,
          name: endpoint.name,
          config: {
            encryptedApiKey: endpoint.encryptedApiKey,
            baseUrl: endpoint.baseUrl,
            modelIdMapping: endpoint.modelIdMapping,
          },
          enabledModelIds: [],
          disabledModelIds: [],
          discoveredModels: [],
        };
      case 'azure':
        return {
          id: endpoint.id,
          typeId,
          name: endpoint.name,
          config: {
            encryptedApiKey: endpoint.encryptedApiKey,
            baseUrl: endpoint.baseUrl,
            resourceName: endpoint.resourceName,
            apiVersion: endpoint.apiVersion,
            modelIdMapping: endpoint.modelIdMapping,
          },
          enabledModelIds: [],
          disabledModelIds: [],
          discoveredModels: [],
        };
      case 'bedrock':
        return {
          id: endpoint.id,
          typeId,
          name: endpoint.name,
          config: {
            encryptedApiKey: endpoint.encryptedApiKey,
            encryptedSecretKey: endpoint.encryptedSecretKey,
            region: endpoint.region,
            awsAuthMode: endpoint.awsAuthMode ?? 'access-keys',
            awsProfileName: endpoint.awsProfileName,
            modelIdMapping: endpoint.modelIdMapping,
          },
          enabledModelIds: [],
          disabledModelIds: [],
          discoveredModels: [],
        };
      case 'vertex':
        return {
          id: endpoint.id,
          typeId,
          name: endpoint.name,
          config: {
            encryptedGoogleCredentials: endpoint.encryptedGoogleCredentials,
            projectId: endpoint.projectId,
            location: endpoint.location,
            modelIdMapping: endpoint.modelIdMapping,
          },
          enabledModelIds: [],
          disabledModelIds: [],
          discoveredModels: [],
        };
      default:
        // Exhaustive guard — if a new apiSpec is added without a mapping
        // this throws at migration time rather than silently dropping data.
        throw new Error(
          `endpointToInstance: unmapped typeId ${typeId} for endpoint ${endpoint.id}`,
        );
    }
  }

  /**
   * Connect to Karton services for reactive sync.
   * Should be called after WindowLayoutService and PagesService are created.
   */
  public connectKarton(
    uiKarton: KartonService,
    pagesService: PagesService,
  ): void {
    this.logger.debug('[PreferencesService] Connecting to Karton...');

    this.uiKarton = uiKarton;
    this.pagesService = pagesService;

    // Sync current preferences to Karton state
    this.syncToKarton();

    // Register procedure handlers
    this.registerProcedures();

    this.logger.debug('[PreferencesService] Connected to Karton');
  }

  private registerProcedures(): void {
    if (!this.uiKarton || !this.pagesService) {
      throw new Error('Karton not connected');
    }

    // UI procedure for updating preferences
    this.uiKarton.registerServerProcedureHandler(
      'preferences.update',
      async (_callingClientId: string, patches: Patch[]) => {
        await this.update(patches);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.setProviderApiKey',
      async (
        _callingClientId: string,
        provider: ModelProvider,
        apiKey: string,
      ) => {
        await this.setProviderApiKey(provider, apiKey);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.clearProviderApiKey',
      async (_callingClientId: string, provider: ModelProvider) => {
        await this.clearProviderApiKey(provider);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.disconnectProvider',
      async (_callingClientId: string, provider: ModelProvider) => {
        await this.disconnectProvider(provider);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.connectCodingPlan',
      async (
        _callingClientId: string,
        planId: CodingPlanId,
        apiKey: string,
      ) => {
        return this.connectCodingPlan(planId, apiKey);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.connectProvider',
      async (
        _callingClientId: string,
        provider: ModelProvider,
        apiKey: string,
      ) => {
        return this.connectProvider(provider, apiKey);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.setCustomEndpointApiKey',
      async (_callingClientId: string, endpointId: string, apiKey: string) => {
        await this.setCustomEndpointApiKey(endpointId, apiKey);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.clearCustomEndpointApiKey',
      async (_callingClientId: string, endpointId: string) => {
        await this.clearCustomEndpointApiKey(endpointId);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.setCustomEndpointSecretKey',
      async (
        _callingClientId: string,
        endpointId: string,
        secretKey: string,
      ) => {
        await this.setCustomEndpointSecretKey(endpointId, secretKey);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.setCustomEndpointGoogleCredentials',
      async (
        _callingClientId: string,
        endpointId: string,
        credentials: string,
      ) => {
        await this.setCustomEndpointGoogleCredentials(endpointId, credentials);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.listAwsProfiles',
      async (_callingClientId: string) => {
        const { listAwsProfiles } = await import('../utils/aws-profiles');
        return listAwsProfiles();
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.validateProviderApiKey',
      async (
        _callingClientId: string,
        provider: ModelProvider,
        apiKey: string,
        baseUrl?: string,
      ) => {
        const { validateApiKeys } = await import('../utils/validate-api-keys');
        const results = await validateApiKeys({ [provider]: apiKey }, baseUrl);
        return results[provider];
      },
    );

    // --- Provider instance procedures (new instance-based API) ---
    this.uiKarton.registerServerProcedureHandler(
      'preferences.addProviderInstance',
      async (
        _callingClientId: string,
        args: {
          typeId: string;
          name?: string;
          config: Record<string, unknown>;
          validateApiKey?: string;
        },
      ) => {
        return this.addProviderInstance(args);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.removeProviderInstance',
      async (_callingClientId: string, instanceId: string) => {
        await this.removeProviderInstance(instanceId);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.updateProviderInstance',
      async (
        _callingClientId: string,
        instanceId: string,
        partialConfig: Record<string, unknown>,
        name?: string,
      ) => {
        await this.updateProviderInstance(instanceId, partialConfig, name);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.setProviderInstanceApiKey',
      async (_callingClientId: string, instanceId: string, apiKey: string) => {
        await this.setProviderInstanceApiKey(instanceId, apiKey);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.clearProviderInstanceApiKey',
      async (_callingClientId: string, instanceId: string) => {
        await this.clearProviderInstanceApiKey(instanceId);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.setProviderInstanceSecretKey',
      async (
        _callingClientId: string,
        instanceId: string,
        secretKey: string,
      ) => {
        await this.setProviderInstanceSecretKey(instanceId, secretKey);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.setProviderInstanceGoogleCredentials',
      async (
        _callingClientId: string,
        instanceId: string,
        credentials: string,
      ) => {
        await this.setProviderInstanceGoogleCredentials(
          instanceId,
          credentials,
        );
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.validateProviderInstanceApiKey',
      async (_callingClientId: string, instanceId: string, apiKey: string) => {
        return this.validateProviderInstanceApiKey(instanceId, apiKey);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.setInstanceEnabledModels',
      async (
        _callingClientId: string,
        instanceId: string,
        enabledModelIds: string[],
      ) => {
        await this.setInstanceEnabledModels(instanceId, enabledModelIds);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'preferences.refreshInstanceModels',
      async (_callingClientId: string, instanceId: string) => {
        return this.refreshInstanceModels(instanceId);
      },
    );

    // Dev toolbar procedures
    this.uiKarton.registerServerProcedureHandler(
      'devToolbar.updateWidgetOrder',
      async (_callingClientId: string, order: WidgetId[]) => {
        this.logger.debug('[PreferencesService] Updating widget order', {
          order,
        });
        const patches: Patch[] = [
          {
            op: 'replace',
            path: ['devToolbar', 'widgetOrder'],
            value: order,
          },
        ];
        await this.update(patches);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'devToolbar.updateOriginSettings',
      async (
        _callingClientId: string,
        origin: string,
        settings: Partial<Omit<DevToolbarOriginSettings, 'lastAccessedAt'>>,
      ) => {
        this.logger.debug('[PreferencesService] Updating origin settings', {
          origin,
          settings,
        });

        // Ensure origin exists first
        if (!this.preferences.devToolbar?.originSettings?.[origin]) {
          await this.getOrCreateOriginSettings(origin);
        }

        // Build patches for each setting that was provided
        const patches: Patch[] = [];

        if (settings.panelOpenStates !== undefined) {
          for (const [widgetId, isOpen] of Object.entries(
            settings.panelOpenStates,
          )) {
            patches.push({
              op: 'add',
              path: [
                'devToolbar',
                'originSettings',
                origin,
                'panelOpenStates',
                widgetId,
              ],
              value: isOpen,
            });
          }
        }

        if (settings.toolbarWidth !== undefined) {
          patches.push({
            op: 'replace',
            path: ['devToolbar', 'originSettings', origin, 'toolbarWidth'],
            value: settings.toolbarWidth,
          });
        }

        // Update lastAccessedAt
        patches.push({
          op: 'replace',
          path: ['devToolbar', 'originSettings', origin, 'lastAccessedAt'],
          value: Date.now(),
        });

        if (patches.length > 0) {
          await this.update(patches);
        }
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'devToolbar.getOrCreateOriginSettings',
      async (_callingClientId: string, origin: string) => {
        return this.getOrCreateOriginSettings(origin);
      },
    );
  }

  private syncToKarton(): void {
    if (!this.uiKarton || !this.pagesService) {
      // Not connected yet, skip sync
      return;
    }

    const prefs = structuredClone(this.preferences);

    // Sync to UI Karton state
    this.uiKarton.setState((draft) => {
      draft.preferences = prefs;
    });
  }

  private async save(
    preferences: UserPreferences = this.preferences,
  ): Promise<void> {
    await writePersistedData('preferences', userPreferencesSchema, preferences);
    this.logger.debug('[PreferencesService] Saved preferences to disk');
  }

  /**
   * Get a clone of the current preferences.
   */
  public get(): UserPreferences {
    this.assertNotDisposed();
    return structuredClone(this.preferences);
  }

  private async enqueuePreferenceWrite<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const next = this.preferenceWriteQueue.then(operation, operation);
    this.preferenceWriteQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async replacePreferences(
    nextPreferences: UserPreferences,
  ): Promise<void> {
    const parsed = userPreferencesSchema.parse(nextPreferences);
    const oldPrefs = structuredClone(this.preferences);

    await this.save(parsed);
    this.preferences = parsed;
    this.syncToKarton();
    this.notifyListeners(this.preferences, oldPrefs);
  }

  /**
   * Update preferences by applying Immer patches.
   *
   * Patches are JSON-serializable objects created using `produceWithPatches` from Immer.
   * See the class documentation for examples of how to create patches.
   *
   * @param patches - Array of Immer patches to apply
   * @throws If patches result in invalid preferences (fails Zod validation)
   */
  public async update(patches: Patch[]): Promise<void> {
    this.assertNotDisposed();
    this.logger.debug('[PreferencesService] Applying patches...', { patches });

    await this.enqueuePreferenceWrite(async () => {
      // Apply patches using Immer
      const patched = applyPatches(this.preferences, patches);

      await this.replacePreferences(patched);
    });

    this.logger.debug('[PreferencesService] Patches applied successfully');
  }

  public async snoozeWorkspaceGitCleanupCandidates(
    paths: string[],
  ): Promise<void> {
    this.assertNotDisposed();
    const uniquePaths = Array.from(new Set(paths));
    if (uniquePaths.length === 0) return;

    await this.enqueuePreferenceWrite(async () => {
      const nextPreferences = structuredClone(this.preferences);
      const dismissedCandidates = {
        ...nextPreferences.agent.workspaceGitCleanup.dismissedCandidates,
      };
      const dismissedAt = Date.now();
      for (const path of uniquePaths) {
        dismissedCandidates[path] = { dismissedAt };
      }
      nextPreferences.agent.workspaceGitCleanup.dismissedCandidates =
        dismissedCandidates;

      await this.replacePreferences(nextPreferences);
    });
  }

  public async pruneWorkspaceGitCleanupSnoozes(
    activeCandidatePaths: string[],
    maxAgeMs: number,
    now = Date.now(),
  ): Promise<void> {
    this.assertNotDisposed();
    const activeCandidatePathSet = new Set(activeCandidatePaths);

    await this.enqueuePreferenceWrite(async () => {
      const dismissedCandidates =
        this.preferences.agent.workspaceGitCleanup.dismissedCandidates;
      const nextDismissedCandidates: typeof dismissedCandidates = {};

      for (const [path, value] of Object.entries(dismissedCandidates)) {
        if (!activeCandidatePathSet.has(path)) continue;
        if (now - value.dismissedAt >= maxAgeMs) continue;
        nextDismissedCandidates[path] = value;
      }

      if (
        Object.keys(nextDismissedCandidates).length ===
          Object.keys(dismissedCandidates).length &&
        Object.entries(nextDismissedCandidates).every(
          ([path, value]) => dismissedCandidates[path] === value,
        )
      ) {
        return;
      }

      const nextPreferences = structuredClone(this.preferences);
      nextPreferences.agent.workspaceGitCleanup.dismissedCandidates =
        nextDismissedCandidates;

      await this.replacePreferences(nextPreferences);
    });
  }

  /**
   * Add a listener that's called when preferences change.
   */
  public addListener(listener: PreferencesListener): void {
    this.logger.debug('[PreferencesService] Adding preferences listener');
    this.listeners.push(listener);
  }

  /**
   * Remove a previously added listener.
   */
  public removeListener(listener: PreferencesListener): void {
    this.logger.debug('[PreferencesService] Removing preferences listener');
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  // ===========================================================================
  // Permission Helper Methods
  // ===========================================================================

  /**
   * Get the effective permission setting for an origin.
   * Checks host exceptions first, then falls back to the global default.
   *
   * @param origin - The origin to check (e.g., "https://example.com")
   * @param permissionType - The type of permission to check
   * @returns The effective permission setting (Ask, Allow, or Block)
   */
  public getPermissionSetting(
    origin: string,
    permissionType: ConfigurablePermissionType,
  ): PermissionSetting {
    this.assertNotDisposed();

    // Check for host exception first
    const exception =
      this.preferences.permissions?.exceptions?.[permissionType]?.[origin];
    if (exception) {
      return exception.setting;
    }

    // Fall back to global default
    return (
      this.preferences.permissions?.defaults?.[permissionType] ??
      PermissionSetting.Ask
    );
  }

  /**
   * Set a host-specific permission exception.
   * Used by "Always Allow" and "Always Block" actions.
   *
   * @param origin - The origin to set the exception for
   * @param permissionType - The type of permission
   * @param setting - The permission setting to apply
   */
  public async setPermissionException(
    origin: string,
    permissionType: ConfigurablePermissionType,
    setting: PermissionSetting,
  ): Promise<void> {
    this.assertNotDisposed();

    const patches: Patch[] = [
      {
        op: 'add',
        path: ['permissions', 'exceptions', permissionType, origin],
        value: {
          setting,
          lastModified: Date.now(),
        },
      },
    ];

    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Set permission exception: ${permissionType} for ${origin} = ${PermissionSetting[setting]}`,
    );
  }

  /**
   * Clear a host-specific permission exception.
   * Reverts the origin to using the global default for this permission type.
   *
   * @param origin - The origin to clear the exception for
   * @param permissionType - The type of permission
   */
  public async clearPermissionException(
    origin: string,
    permissionType: ConfigurablePermissionType,
  ): Promise<void> {
    this.assertNotDisposed();

    // Only clear if it exists
    if (this.preferences.permissions?.exceptions?.[permissionType]?.[origin]) {
      const patches: Patch[] = [
        {
          op: 'remove',
          path: ['permissions', 'exceptions', permissionType, origin],
        },
      ];

      await this.update(patches);
      this.logger.debug(
        `[PreferencesService] Cleared permission exception: ${permissionType} for ${origin}`,
      );
    }
  }

  /**
   * Clear all exceptions for a specific permission type.
   *
   * @param permissionType - The type of permission to clear all exceptions for
   */
  public async clearAllPermissionExceptions(
    permissionType: ConfigurablePermissionType,
  ): Promise<void> {
    this.assertNotDisposed();

    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['permissions', 'exceptions', permissionType],
        value: {},
      },
    ];

    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Cleared all permission exceptions for: ${permissionType}`,
    );
  }

  /**
   * Clear ALL permission exceptions for ALL permission types.
   * Used when clearing browsing data.
   */
  public async clearAllPermissionExceptionsForAllTypes(): Promise<void> {
    this.assertNotDisposed();

    // Create empty exceptions object for all permission types
    const emptyExceptions: Record<string, Record<string, unknown>> = {};
    for (const permType of configurablePermissionTypes) {
      emptyExceptions[permType] = {};
    }

    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['permissions', 'exceptions'],
        value: emptyExceptions,
      },
    ];

    await this.update(patches);
    this.logger.debug(
      '[PreferencesService] Cleared all permission exceptions for all types',
    );
  }

  // ===========================================================================
  // Dev Toolbar Helper Methods
  // ===========================================================================

  /**
   * Merges stored widget order with defaults:
   * - Keeps existing widgets in user's order
   * - Adds new widgets at their default position
   * - Removes widgets that no longer exist
   */
  private mergeWidgetOrder(storedOrder: WidgetId[]): WidgetId[] {
    const result: WidgetId[] = [];
    const storedSet = new Set(storedOrder);
    const defaultSet = new Set(DEFAULT_WIDGET_ORDER);

    // Keep existing widgets in user's order (if they still exist)
    for (const id of storedOrder) {
      if (defaultSet.has(id)) {
        result.push(id);
      }
    }

    // Add new widgets at their default position
    for (let i = 0; i < DEFAULT_WIDGET_ORDER.length; i++) {
      const id = DEFAULT_WIDGET_ORDER[i];
      if (!storedSet.has(id)) {
        // Find the position to insert: after the last existing item that comes before it in defaults
        let insertIndex = result.length;
        for (let j = i - 1; j >= 0; j--) {
          const prevInDefault = DEFAULT_WIDGET_ORDER[j];
          const prevIndex = result.indexOf(prevInDefault);
          if (prevIndex !== -1) {
            insertIndex = prevIndex + 1;
            break;
          }
        }
        result.splice(insertIndex, 0, id);
      }
    }

    return result;
  }

  /**
   * Get the dev toolbar widget order, merging with defaults.
   */
  public getDevToolbarWidgetOrder(): WidgetId[] {
    const stored =
      this.preferences.devToolbar?.widgetOrder ?? DEFAULT_WIDGET_ORDER;
    return this.mergeWidgetOrder(stored);
  }

  /**
   * Get or create origin settings for a specific origin.
   * If the origin doesn't exist, creates settings from the last used origin.
   * Handles LRU eviction if there are too many origins.
   */
  public async getOrCreateOriginSettings(
    origin: string,
  ): Promise<DevToolbarOriginSettings> {
    this.assertNotDisposed();

    const existingSettings =
      this.preferences.devToolbar?.originSettings?.[origin];

    if (existingSettings) {
      // Update lastAccessedAt and lastUsedOrigin
      const patches: Patch[] = [
        {
          op: 'replace',
          path: ['devToolbar', 'originSettings', origin, 'lastAccessedAt'],
          value: Date.now(),
        },
        {
          op: 'replace',
          path: ['devToolbar', 'lastUsedOrigin'],
          value: origin,
        },
      ];
      await this.update(patches);
      return { ...existingSettings, lastAccessedAt: Date.now() };
    }

    // Create new settings from last used origin or defaults
    const lastUsedOrigin = this.preferences.devToolbar?.lastUsedOrigin;
    const lastUsedSettings = lastUsedOrigin
      ? this.preferences.devToolbar?.originSettings?.[lastUsedOrigin]
      : null;

    const newSettings: DevToolbarOriginSettings = {
      panelOpenStates: lastUsedSettings?.panelOpenStates
        ? { ...lastUsedSettings.panelOpenStates }
        : {},
      toolbarWidth: lastUsedSettings?.toolbarWidth ?? null,
      lastAccessedAt: Date.now(),
    };

    // Check if we need to evict old origins
    const currentOrigins = Object.entries(
      this.preferences.devToolbar?.originSettings ?? {},
    );
    if (currentOrigins.length >= DEV_TOOLBAR_MAX_ORIGINS) {
      // Find and remove the oldest origin
      const sorted = currentOrigins.sort(
        (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt,
      );
      const oldestOrigin = sorted[0][0];
      await this.update([
        {
          op: 'remove',
          path: ['devToolbar', 'originSettings', oldestOrigin],
        },
      ]);
    }

    // Add the new origin settings
    const patches: Patch[] = [
      {
        op: 'add',
        path: ['devToolbar', 'originSettings', origin],
        value: newSettings,
      },
      {
        op: 'replace',
        path: ['devToolbar', 'lastUsedOrigin'],
        value: origin,
      },
    ];
    await this.update(patches);

    return newSettings;
  }

  // ===========================================================================
  // Provider API Key Methods
  // ===========================================================================

  /**
   * Set an API key for a provider, encrypted via Electron's safeStorage.
   * The key is encrypted, base64-encoded, and stored in preferences.
   */
  public async setProviderApiKey(
    provider: ModelProvider,
    plaintextKey: string,
  ): Promise<void> {
    this.assertNotDisposed();

    // Validate provider
    modelProviderSchema.parse(provider);

    const encrypted = safeStorage.encryptString(plaintextKey);
    const encryptedBase64 = encrypted.toString('base64');

    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['providerConfigs', provider, 'encryptedApiKey'],
        value: encryptedBase64,
      },
      {
        op: 'replace',
        path: ['providerConfigs', provider, 'connectedCodingPlanId'],
        value: undefined,
      },
    ];

    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Set encrypted API key for provider: ${provider}`,
    );
  }

  /**
   * Clear the API key for a provider.
   */
  public async clearProviderApiKey(provider: ModelProvider): Promise<void> {
    this.assertNotDisposed();

    // Validate provider
    modelProviderSchema.parse(provider);

    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['providerConfigs', provider, 'encryptedApiKey'],
        value: undefined,
      },
      {
        op: 'replace',
        path: ['providerConfigs', provider, 'connectedCodingPlanId'],
        value: undefined,
      },
    ];

    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Cleared API key for provider: ${provider}`,
    );
  }

  /**
   * Atomically disconnect a provider in one shot:
   *   1. flip providerConfigs[provider].mode back to 'stagewise',
   *   2. clear the encrypted API key.
   *
   * Both patches are applied in a single `update()` call, so the UI cannot
   * observe a partial state where mode is 'stagewise' but the encrypted key
   * is still at rest (or vice versa). This is the inverse of
   * `connectCodingPlan` and replaces the previous two-RPC pattern.
   */
  public async disconnectProvider(provider: ModelProvider): Promise<void> {
    this.assertNotDisposed();
    modelProviderSchema.parse(provider);

    const cfg = this.preferences.providerConfigs[provider];
    const connectedPlanId = cfg?.connectedCodingPlanId;

    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['providerConfigs', provider, 'mode'],
        value: 'stagewise',
      },
      {
        op: 'replace',
        path: ['providerConfigs', provider, 'encryptedApiKey'],
        value: undefined,
      },
      {
        op: 'replace',
        path: ['providerConfigs', provider, 'connectedCodingPlanId'],
        value: undefined,
      },
    ];

    // Remove the corresponding coding-plan instance so the UI updates.
    if (connectedPlanId) {
      const idx = this.preferences.providerInstances.findIndex(
        (i) =>
          i.typeId === 'coding-plan' &&
          (i.config as { planId?: string }).planId === connectedPlanId,
      );
      if (idx !== -1) {
        patches.push({ op: 'remove', path: ['providerInstances', idx] });
      }
    }

    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Disconnected provider: ${provider}`,
    );
  }

  /**
   * Atomically connect a provider in one shot:
   *   1. validate the key against the provider,
   *   2. encrypt+store it,
   *   3. flip providerConfigs[provider].mode to 'official'.
   *
   * Both the encrypted-key patch and the mode patch are applied in a single
   * `update()` call, so the UI cannot observe a partial state where the key
   * is stored but mode is still 'stagewise' (or vice versa). This is the
   * inverse of `disconnectProvider` and replaces the previous two-RPC pattern
   * (`setProviderApiKey` + separate mode flip).
   *
   * Returns without mutating state if validation fails.
   */
  public async connectProvider(
    provider: ModelProvider,
    apiKey: string,
  ): Promise<{ success: true } | { success: false; error: string }> {
    this.assertNotDisposed();
    modelProviderSchema.parse(provider);

    if (!apiKey) {
      return { success: false, error: 'API key is required' };
    }

    // 1. Validate the key against the provider.
    const results = await validateApiKeys({ [provider]: apiKey });
    const result = results[provider];
    if (!result) {
      return { success: false, error: 'Validation was skipped' };
    }
    if (result.success === false) {
      return result;
    }

    // 2 + 3. Encrypt+store key and flip mode in one patch batch.
    const encryptedBase64 = safeStorage
      .encryptString(apiKey)
      .toString('base64');
    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['providerConfigs', provider, 'encryptedApiKey'],
        value: encryptedBase64,
      },
      {
        op: 'replace',
        path: ['providerConfigs', provider, 'mode'],
        value: 'official',
      },
      {
        op: 'replace',
        path: ['providerConfigs', provider, 'connectedCodingPlanId'],
        value: undefined,
      },
    ];
    await this.update(patches);

    this.logger.debug(`[PreferencesService] Connected provider: ${provider}`);
    return { success: true };
  }

  /**
   * Connect a Tier-A coding plan in one shot:
   *   1. validate the key against the plan's provider,
   *   2. encrypt+store it,
   *   3. flip providerConfigs[provider].mode to 'official'.
   *
   * Returns without mutating state if validation fails.
   */
  public async connectCodingPlan(
    planId: CodingPlanId,
    apiKey: string,
  ): Promise<{ success: true } | { success: false; error: string }> {
    this.assertNotDisposed();

    if (!isCodingPlanId(planId)) {
      return { success: false, error: `Unknown coding plan: ${planId}` };
    }
    const plan = CODING_PLANS[planId];

    if (!apiKey) {
      return { success: false, error: 'API key is required' };
    }

    // 1. Validate the key against the plan's provider or dedicated endpoint.
    const result = await validateCodingPlanApiKey(plan, apiKey);
    if (!result) {
      return { success: false, error: 'Validation was skipped' };
    }
    if (result.success === false) {
      return result;
    }

    // 2 + 3. Encrypt+store key, flip mode, and create/update the
    // provider instance in one patch batch.
    const encryptedBase64 = safeStorage
      .encryptString(apiKey)
      .toString('base64');
    const instanceId = `coding-plan:${planId}`;
    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['providerConfigs', plan.provider, 'encryptedApiKey'],
        value: encryptedBase64,
      },
      {
        op: 'replace',
        path: ['providerConfigs', plan.provider, 'mode'],
        value: 'official',
      },
      {
        op: 'replace',
        path: ['providerConfigs', plan.provider, 'connectedCodingPlanId'],
        value: plan.id,
      },
    ];

    // Ensure a matching providerInstances entry so the UI picks it up.
    const existingIdx = this.preferences.providerInstances.findIndex(
      (i) =>
        i.typeId === 'coding-plan' &&
        (i.config as { planId?: string }).planId === planId,
    );
    if (existingIdx !== -1) {
      patches.push({
        op: 'replace',
        path: ['providerInstances', existingIdx, 'config', 'encryptedApiKey'],
        value: encryptedBase64,
      });
    } else {
      const instance = {
        id: instanceId,
        typeId: 'coding-plan' as ProviderInstance['typeId'],
        name: plan.displayName,
        config: {
          encryptedApiKey: encryptedBase64,
          planId: plan.id,
          baseUrl: plan.baseUrl,
        } as ProviderInstance['config'],
        enabledModelIds: [] as string[],
        disabledModelIds: [] as string[],
        discoveredModels: [],
      };
      patches.push({
        op: 'add',
        path: ['providerInstances', this.preferences.providerInstances.length],
        value: instance,
      });
    }

    await this.update(patches);

    this.logger.debug(
      `[PreferencesService] Connected coding plan ${planId} ` +
        `(provider=${plan.provider})`,
    );
    return { success: true };
  }

  // ===========================================================================
  // Custom Endpoint API Key Methods
  // ===========================================================================

  /**
   * Set an API key for a custom endpoint, encrypted via Electron's safeStorage.
   */
  public async setCustomEndpointApiKey(
    endpointId: string,
    plaintextKey: string,
  ): Promise<void> {
    this.assertNotDisposed();

    const idx = this.preferences.customEndpoints.findIndex(
      (ep) => ep.id === endpointId,
    );
    if (idx === -1) throw new Error(`Custom endpoint ${endpointId} not found`);

    const encrypted = safeStorage.encryptString(plaintextKey);
    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['customEndpoints', idx, 'encryptedApiKey'],
        value: encrypted.toString('base64'),
      },
    ];

    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Set encrypted API key for custom endpoint: ${endpointId}`,
    );
  }

  /**
   * Clear the API key for a custom endpoint.
   */
  public async clearCustomEndpointApiKey(endpointId: string): Promise<void> {
    this.assertNotDisposed();

    const idx = this.preferences.customEndpoints.findIndex(
      (ep) => ep.id === endpointId,
    );
    if (idx === -1) throw new Error(`Custom endpoint ${endpointId} not found`);

    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['customEndpoints', idx, 'encryptedApiKey'],
        value: undefined,
      },
    ];

    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Cleared API key for custom endpoint: ${endpointId}`,
    );
  }

  /**
   * Encrypt and store a secret key for an Amazon Bedrock custom endpoint.
   */
  public async setCustomEndpointSecretKey(
    endpointId: string,
    plaintextKey: string,
  ): Promise<void> {
    this.assertNotDisposed();

    const idx = this.preferences.customEndpoints.findIndex(
      (ep) => ep.id === endpointId,
    );
    if (idx === -1) throw new Error(`Custom endpoint ${endpointId} not found`);

    const encrypted = safeStorage.encryptString(plaintextKey);
    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['customEndpoints', idx, 'encryptedSecretKey'],
        value: encrypted.toString('base64'),
      },
    ];

    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Set encrypted secret key for endpoint: ${endpointId}`,
    );
  }

  /**
   * Encrypt and store Google service account credentials for a Vertex AI endpoint.
   */
  public async setCustomEndpointGoogleCredentials(
    endpointId: string,
    credentialsJson: string,
  ): Promise<void> {
    this.assertNotDisposed();

    const idx = this.preferences.customEndpoints.findIndex(
      (ep) => ep.id === endpointId,
    );
    if (idx === -1) throw new Error(`Custom endpoint ${endpointId} not found`);

    const encrypted = safeStorage.encryptString(credentialsJson);
    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['customEndpoints', idx, 'encryptedGoogleCredentials'],
        value: encrypted.toString('base64'),
      },
    ];

    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Set encrypted Google credentials for endpoint: ${endpointId}`,
    );
  }

  /**
   * Decrypt an API key stored in preferences.
   * Returns empty string if no key is stored or decryption fails.
   */
  public decryptProviderApiKey(encryptedBase64?: string): string {
    if (!encryptedBase64) return '';
    try {
      const buffer = Buffer.from(encryptedBase64, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (error) {
      this.logger.error(
        '[PreferencesService] Failed to decrypt API key',
        error,
      );
      return '';
    }
  }

  // ===========================================================================
  // Provider Instance Methods (new instance-based API)
  // ===========================================================================

  /** Find the index of a provider instance by id, or -1. */
  private findProviderInstanceIndex(instanceId: string): number {
    return this.preferences.providerInstances.findIndex(
      (i) => i.id === instanceId,
    );
  }

  /**
   * Add a new provider instance. When `validateApiKey` is supplied and the
   * typeId is a vendor-api type, the key is validated before the instance is
   * persisted. Returns the new instance id on success.
   */
  public async addProviderInstance(args: {
    typeId: string;
    name?: string;
    config: Record<string, unknown>;
    validateApiKey?: string;
  }): Promise<
    | { success: true; instanceId: string; discoveredModels: DiscoveredModel[] }
    | { success: false; error: string }
  > {
    this.assertNotDisposed();

    const { typeId, config, validateApiKey } = args;
    const providerType = getProviderType(typeId);

    // Build the decrypted sensitive-values map up front so it can be used
    // for both validation and discovery.
    const sensitiveValues: Record<string, string> = {};
    if (validateApiKey) {
      sensitiveValues.encryptedApiKey = validateApiKey;
    }

    // ── Credential validation ────────────────────────────────────────────────
    // Delegates to the provider type's `validateCredentials` method when
    // available, replacing the previous hardcoded if-branches per typeId.
    if (validateApiKey && providerType.validateCredentials) {
      const result = await providerType.validateCredentials(
        { ...config, encryptedApiKey: validateApiKey } as never,
        sensitiveValues,
      );
      if (result.success === false) {
        return result;
      }
    }

    // Encrypt the API key if provided in plaintext.
    const finalConfig = { ...config };
    if (validateApiKey) {
      finalConfig.encryptedApiKey = safeStorage
        .encryptString(validateApiKey)
        .toString('base64');
    }

    const instanceId = `${typeId}-${crypto.randomUUID()}`;
    const name =
      args.name ??
      (typeId.endsWith('-api')
        ? (PROVIDER_TYPE_DISPLAY_INFO[typeId as ProviderInstanceTypeId]
            ?.displayName ?? typeId)
        : typeId === 'coding-plan'
          ? (CODING_PLANS[finalConfig.planId as CodingPlanId]?.displayName ??
            'Coding Plan')
          : typeId);

    // ── Model discovery ───────────────────────────────────────────────────────
    let discovered: DiscoveredModel[] = [];
    if (providerType.getInitialModels) {
      try {
        discovered = await providerType.getInitialModels(
          finalConfig as never,
          sensitiveValues,
        );
      } catch (err) {
        this.logger.warn(
          `[PreferencesService] Model discovery failed for ${typeId}: ${String(err)}`,
        );
      }
    }

    // Auto-disable non-flagship discovered models so the chat model
    // selector stays clean. Flagship models + catalog models stay enabled.
    // Users can re-enable any model from the settings page.
    const disabledModelIds = computeDisabledModelIdsAfterDiscovery({
      typeId,
      config: finalConfig,
      discoveredModels: discovered,
      existingDisabledModelIds: [],
      existingDiscoveredModelIds: new Set(),
    });

    const instance = {
      id: instanceId,
      typeId: typeId as ProviderInstance['typeId'],
      name,
      config: finalConfig as ProviderInstance['config'],
      enabledModelIds: [] as string[],
      disabledModelIds,
      discoveredModels: discovered,
    };

    const patches: Patch[] = [
      {
        op: 'add',
        path: ['providerInstances', this.preferences.providerInstances.length],
        value: instance,
      },
    ];
    await this.update(patches);

    this.logger.debug(
      `[PreferencesService] Added provider instance: ${instanceId} (${discovered.length} models discovered)`,
    );
    return { success: true, instanceId, discoveredModels: discovered };
  }

  /**
   * Remove a provider instance by id. Vendors that had this instance as
   * their route fall back to the shared stagewise instance at routing time.
   */
  public async removeProviderInstance(instanceId: string): Promise<void> {
    this.assertNotDisposed();
    const idx = this.findProviderInstanceIndex(instanceId);
    if (idx === -1) {
      throw new Error(`Provider instance ${instanceId} not found`);
    }
    const patches: Patch[] = [
      { op: 'remove', path: ['providerInstances', idx] },
    ];
    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Removed provider instance: ${instanceId}`,
    );
  }

  /**
   * Merge a partial config into an existing provider instance, and/or
   * update its display name. Only top-level config keys are merged.
   */
  public async updateProviderInstance(
    instanceId: string,
    partialConfig: Record<string, unknown>,
    name?: string,
  ): Promise<void> {
    this.assertNotDisposed();
    const idx = this.findProviderInstanceIndex(instanceId);
    if (idx === -1) {
      throw new Error(`Provider instance ${instanceId} not found`);
    }
    const current = this.preferences.providerInstances[idx];
    const nextConfig = { ...current.config, ...partialConfig };
    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['providerInstances', idx, 'config'],
        value: nextConfig,
      },
    ];
    if (name !== undefined && name !== current.name) {
      patches.push({
        op: 'replace',
        path: ['providerInstances', idx, 'name'],
        value: name,
      });
    }
    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Updated provider instance: ${instanceId}`,
    );
  }

  /**
   * Set an encrypted API key on a provider instance.
   */
  public async setProviderInstanceApiKey(
    instanceId: string,
    plaintextKey: string,
  ): Promise<void> {
    this.assertNotDisposed();
    const idx = this.findProviderInstanceIndex(instanceId);
    if (idx === -1) {
      throw new Error(`Provider instance ${instanceId} not found`);
    }
    const encrypted = safeStorage
      .encryptString(plaintextKey)
      .toString('base64');
    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['providerInstances', idx, 'config', 'encryptedApiKey'],
        value: encrypted,
      },
    ];
    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Set API key for instance: ${instanceId}`,
    );
  }

  /**
   * Clear the encrypted API key on a provider instance.
   */
  public async clearProviderInstanceApiKey(instanceId: string): Promise<void> {
    this.assertNotDisposed();
    const idx = this.findProviderInstanceIndex(instanceId);
    if (idx === -1) {
      throw new Error(`Provider instance ${instanceId} not found`);
    }
    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['providerInstances', idx, 'config', 'encryptedApiKey'],
        value: undefined,
      },
    ];
    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Cleared API key for instance: ${instanceId}`,
    );
  }

  /**
   * Set an encrypted secret key (Bedrock) on a provider instance.
   */
  public async setProviderInstanceSecretKey(
    instanceId: string,
    plaintextKey: string,
  ): Promise<void> {
    this.assertNotDisposed();
    const idx = this.findProviderInstanceIndex(instanceId);
    if (idx === -1) {
      throw new Error(`Provider instance ${instanceId} not found`);
    }
    const encrypted = safeStorage
      .encryptString(plaintextKey)
      .toString('base64');
    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['providerInstances', idx, 'config', 'encryptedSecretKey'],
        value: encrypted,
      },
    ];
    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Set secret key for instance: ${instanceId}`,
    );
  }

  /**
   * Set encrypted Google service account credentials (Vertex) on a provider instance.
   */
  public async setProviderInstanceGoogleCredentials(
    instanceId: string,
    credentialsJson: string,
  ): Promise<void> {
    this.assertNotDisposed();
    const idx = this.findProviderInstanceIndex(instanceId);
    if (idx === -1) {
      throw new Error(`Provider instance ${instanceId} not found`);
    }
    const encrypted = safeStorage
      .encryptString(credentialsJson)
      .toString('base64');
    const patches: Patch[] = [
      {
        op: 'replace',
        path: [
          'providerInstances',
          idx,
          'config',
          'encryptedGoogleCredentials',
        ],
        value: encrypted,
      },
    ];
    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Set Google credentials for instance: ${instanceId}`,
    );
  }

  /**
   * Validate an API key against a provider instance's vendor endpoint.
   */
  public async validateProviderInstanceApiKey(
    instanceId: string,
    apiKey: string,
  ): Promise<ApiKeyValidationResult> {
    this.assertNotDisposed();
    const idx = this.findProviderInstanceIndex(instanceId);
    if (idx === -1) {
      throw new Error(`Provider instance ${instanceId} not found`);
    }
    const instance = this.preferences.providerInstances[idx];
    if (instance.typeId.endsWith('-api')) {
      const vendor = instance.typeId.slice(0, -4) as ModelProvider;
      const baseUrl =
        (instance.config as { baseUrl?: string }).baseUrl ?? undefined;
      const results = await validateApiKeys({ [vendor]: apiKey }, baseUrl);
      return results[vendor] ?? null;
    }
    if (instance.typeId === 'coding-plan') {
      const plan =
        CODING_PLANS[instance.config.planId as keyof typeof CODING_PLANS];
      if (!plan) return null;
      return validateCodingPlanApiKey(plan, apiKey);
    }
    return null;
  }

  /**
   * Set the enabled model IDs for a provider instance.
   * This is used after discovery to select which discovered models to expose.
   */
  public async setInstanceEnabledModels(
    instanceId: string,
    enabledModelIds: string[],
  ): Promise<void> {
    this.assertNotDisposed();
    const idx = this.findProviderInstanceIndex(instanceId);
    if (idx === -1) {
      throw new Error(`Provider instance ${instanceId} not found`);
    }
    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['providerInstances', idx, 'enabledModelIds'],
        value: enabledModelIds,
      },
    ];
    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Set enabled models for instance: ${instanceId}`,
    );
  }

  /**
   * Re-discover models for a provider instance. Calls the provider type's
   * `getInitialModels` (or `refreshModels` if defined), caches the result
   * in `discoveredModels`, and returns the updated list.
   */
  public async refreshInstanceModels(
    instanceId: string,
  ): Promise<DiscoveredModel[]> {
    this.assertNotDisposed();
    const idx = this.findProviderInstanceIndex(instanceId);
    if (idx === -1) {
      throw new Error(`Provider instance ${instanceId} not found`);
    }
    const instance = this.preferences.providerInstances[idx];
    const type = getProviderType(instance.typeId);

    // Decrypt sensitive fields from the instance config
    const config = instance.config as Record<string, unknown>;
    const decryptedConfig: Record<string, string> = {};
    for (const field of type.sensitiveFields) {
      const encrypted = config[field] as string | undefined;
      if (encrypted) {
        decryptedConfig[field] = this.decryptProviderApiKey(encrypted);
      }
    }

    const refreshFn = type.refreshModels ?? type.getInitialModels;
    if (!refreshFn) {
      return [];
    }
    const models = await refreshFn(instance.config as never, decryptedConfig);

    // Capture the previous discovered model IDs and disabled list so we
    // can preserve user choices for previously-known models while
    // auto-disabling newly-discovered non-flagship models.
    const oldDiscoveredIds = new Set(
      (instance.discoveredModels ?? []).map((dm) => dm.modelId),
    );
    const oldDisabledModelIds = instance.disabledModelIds ?? [];

    const newDisabledModelIds = computeDisabledModelIdsAfterDiscovery({
      typeId: instance.typeId,
      config,
      discoveredModels: models,
      existingDisabledModelIds: oldDisabledModelIds,
      existingDiscoveredModelIds: oldDiscoveredIds,
    });

    const patches: Patch[] = [
      {
        op: 'replace',
        path: ['providerInstances', idx, 'discoveredModels'],
        value: models,
      },
      {
        op: 'replace',
        path: ['providerInstances', idx, 'disabledModelIds'],
        value: newDisabledModelIds,
      },
    ];
    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Refreshed models for instance: ${instanceId} (${models.length} models)`,
    );
    return models;
  }

  private notifyListeners(
    newPrefs: UserPreferences,
    oldPrefs: UserPreferences,
  ): void {
    for (const listener of this.listeners) {
      try {
        listener(newPrefs, oldPrefs);
      } catch (error) {
        this.logger.error(
          '[PreferencesService] Listener threw an error',
          error,
        );
      }
    }
  }

  protected async onTeardown(): Promise<void> {
    this.logger.debug('[PreferencesService] Tearing down...');
    if (this.uiKarton) {
      this.uiKarton.removeServerProcedureHandler('preferences.update');
      this.uiKarton.removeServerProcedureHandler(
        'preferences.setProviderApiKey',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.clearProviderApiKey',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.disconnectProvider',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.connectCodingPlan',
      );
      this.uiKarton.removeServerProcedureHandler('preferences.connectProvider');
      this.uiKarton.removeServerProcedureHandler(
        'preferences.setCustomEndpointApiKey',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.clearCustomEndpointApiKey',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.setCustomEndpointSecretKey',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.setCustomEndpointGoogleCredentials',
      );
      this.uiKarton.removeServerProcedureHandler('preferences.listAwsProfiles');
      this.uiKarton.removeServerProcedureHandler(
        'preferences.validateProviderApiKey',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.addProviderInstance',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.removeProviderInstance',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.updateProviderInstance',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.setProviderInstanceApiKey',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.clearProviderInstanceApiKey',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.setProviderInstanceSecretKey',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.setProviderInstanceGoogleCredentials',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.validateProviderInstanceApiKey',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.setInstanceEnabledModels',
      );
      this.uiKarton.removeServerProcedureHandler(
        'preferences.refreshInstanceModels',
      );
      this.uiKarton.removeServerProcedureHandler(
        'devToolbar.updateWidgetOrder',
      );
      this.uiKarton.removeServerProcedureHandler(
        'devToolbar.updateOriginSettings',
      );
      this.uiKarton.removeServerProcedureHandler(
        'devToolbar.getOrCreateOriginSettings',
      );
    }
    this.listeners = [];
    this.logger.debug('[PreferencesService] Teardown complete');
  }
}
