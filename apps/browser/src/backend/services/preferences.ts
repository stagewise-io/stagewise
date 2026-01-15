import { applyPatches, enablePatches, type Patch } from 'immer';
import type { Logger } from './logger';
import type { KartonService } from './karton';
import type { PagesService } from './pages';
import {
  type UserPreferences,
  type ConfigurablePermissionType,
  userPreferencesSchema,
  defaultUserPreferences,
  PermissionSetting,
  configurablePermissionTypes,
} from '@shared/karton-contracts/ui/shared-types';
import { readPersistedData, writePersistedData } from '../utils/persisted-data';
import { DisposableService } from './disposable';

// Enable Immer patches support
enablePatches();

type PreferencesListener = (
  newPrefs: UserPreferences,
  oldPrefs: UserPreferences,
) => void;

/**
 * Service that manages user preferences with persistence and reactive Karton sync.
 *
 * Preferences are stored in Preferences.json in the global data directory.
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
      'Preferences',
      userPreferencesSchema,
      defaultUserPreferences,
    );

    this.logger.debug('[PreferencesService] Loaded preferences', {
      telemetryLevel: this.preferences.privacy.telemetryLevel,
    });

    this.logger.debug('[PreferencesService] Initialized');
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

    // Pages procedures
    this.pagesService.registerPreferencesHandlers(
      () => this.get(),
      (patches) => this.update(patches),
      () => this.clearAllPermissionExceptionsForAllTypes(),
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
      'Preferences',
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
    }
    this.listeners = [];
    this.logger.debug('[PreferencesService] Teardown complete');
  }
}
