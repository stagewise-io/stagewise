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
  userPreferencesSchema,
  defaultUserPreferences,
  PermissionSetting,
  configurablePermissionTypes,
  modelProviderSchema,
  DEFAULT_WIDGET_ORDER,
  DEV_TOOLBAR_MAX_ORIGINS,
} from '@shared/karton-contracts/ui/shared-types';
import { readPersistedData, writePersistedData } from '../utils/persisted-data';
import { DisposableService } from './disposable';
import { safeStorage } from 'electron';

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

    // Pages procedures
    this.pagesService.registerPreferencesHandlers(
      () => this.get(),
      (patches) => this.update(patches),
      () => this.clearAllPermissionExceptionsForAllTypes(),
      (provider, apiKey) => this.setProviderApiKey(provider, apiKey),
      (provider) => this.clearProviderApiKey(provider),
      (endpointId, apiKey) => this.setCustomEndpointApiKey(endpointId, apiKey),
      (endpointId) => this.clearCustomEndpointApiKey(endpointId),
      (endpointId, secretKey) =>
        this.setCustomEndpointSecretKey(endpointId, secretKey),
      (endpointId, credentials) =>
        this.setCustomEndpointGoogleCredentials(endpointId, credentials),
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

    // Sync to Pages API Karton state
    this.pagesService.syncPreferencesState(structuredClone(this.preferences));
  }

  private async save(): Promise<void> {
    await writePersistedData(
      'preferences',
      userPreferencesSchema,
      this.preferences,
    );
    this.logger.debug('[PreferencesService] Saved preferences to disk');
  }

  /**
   * Get a clone of the current preferences.
   */
  public get(): UserPreferences {
    this.assertNotDisposed();
    return structuredClone(this.preferences);
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

    const oldPrefs = structuredClone(this.preferences);

    // Apply patches using Immer
    const patched = applyPatches(this.preferences, patches);

    // Validate the result against the schema
    this.preferences = userPreferencesSchema.parse(patched);

    await this.save();
    this.syncToKarton();
    this.notifyListeners(this.preferences, oldPrefs);

    this.logger.debug('[PreferencesService] Patches applied successfully');
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
    ];

    await this.update(patches);
    this.logger.debug(
      `[PreferencesService] Cleared API key for provider: ${provider}`,
    );
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
