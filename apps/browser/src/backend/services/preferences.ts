import { applyPatches, enablePatches, type Patch } from 'immer';
import type { Logger } from './logger';
import type { KartonService } from './karton';
import type { PagesService } from './pages';
import {
  type UserPreferences,
  userPreferencesSchema,
  defaultUserPreferences,
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
  private readonly uiKarton: KartonService;
  private readonly pagesService: PagesService;

  private preferences: UserPreferences = defaultUserPreferences;
  private listeners: PreferencesListener[] = [];

  private constructor(
    logger: Logger,
    uiKarton: KartonService,
    pagesService: PagesService,
  ) {
    super();
    this.logger = logger;
    this.uiKarton = uiKarton;
    this.pagesService = pagesService;
  }

  /**
   * Create and initialize a new PreferencesService instance.
   */
  public static async create(
    logger: Logger,
    uiKarton: KartonService,
    pagesService: PagesService,
  ): Promise<PreferencesService> {
    const instance = new PreferencesService(logger, uiKarton, pagesService);
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

    // Sync to Karton state
    this.syncToKarton();

    // Register procedure handlers
    this.registerProcedures();

    this.logger.debug('[PreferencesService] Initialized');
  }

  private registerProcedures(): void {
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
    );
  }

  private syncToKarton(): void {
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
    this.uiKarton.removeServerProcedureHandler('preferences.update');
    this.listeners = [];
    this.logger.debug('[PreferencesService] Teardown complete');
  }
}
