/**
 * NotificationSoundsService — plays sounds and optionally bounces the macOS
 * dock icon when explicit agent notification events are emitted:
 *   - Done (agent finishes work)        → done sound + short dock bounce
 *   - Waiting for user (question/approval) → question sound + long dock bounce
 *   - Error                             → error sound + long dock bounce
 *
 * Sounds are loaded from sound pack directories under assets/sounds/.
 * Each pack can contain done.mp3, question.mp3, and error.mp3.
 * Packs may include pack.json metadata with a human-readable display name.
 * A custom single-MP3 import is stored as a pack that reuses the same file
 * for every notification event.
 *
 * Dock bouncing only applies on macOS and only when the window is not focused.
 * Uses 'informational' (single short bounce) for all events — macOS does not
 * expose a duration API; 'critical' would bounce indefinitely.
 *
 * Notifications are suppressed when:
 * - A sound played less than 10 seconds ago (debounce resets on window focus)
 * - The triggering agent is currently visible AND the window is focused
 *   (user is actively looking at that agent, so the change is self-evident)
 */

import { app, type BaseWindow } from 'electron';
import type { WebContents } from 'electron';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import type { Logger } from './logger';
import type { KartonService } from './karton';
import type { GlobalConfig } from '@shared/karton-contracts/ui/shared-types';
import { DisposableService } from './disposable';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SoundEvent = 'done' | 'question' | 'error';
type SoundLoudness = 'off' | 'subtle' | 'default';

const DEFAULT_SOUND_PACK = 'bubble-pops';

const SOUND_VOLUME: Record<SoundLoudness, number> = {
  off: 0,
  // -12 dB amplitude scalar: 10^(-12/20) ≈ 0.251.
  subtle: 0.251,
  default: 1,
};

// ---------------------------------------------------------------------------
// Imported sound pack manifest format
// ---------------------------------------------------------------------------

/**
 * JSON format for importing custom sound packs.
 *
 * Users can also import a single .mp3 file directly. In that case, the same
 * file is used for done, question, and error notifications, and the pack's
 * display name is the MP3 filename.
 *
 * Example `pack.json`:
 * ```json
 * {
 *   "name": "My Custom Pack",
 *   "description": "Optional description shown in settings.",
 *   "sounds": {
 *     "done": "done.mp3",
 *     "question": "ask.mp3",
 *     "error": null
 *   }
 * }
 * ```
 *
 * Rules:
 * - `name` (required, string): Display name for the sound pack.
 * - `description` (optional, string): Description shown in settings.
 * - `sounds` (required, object): Maps event types to mp3 filenames.
 *   - Keys: `done`, `question`, `error` — all optional.
 *   - Values: relative file paths to .mp3 files (relative to the JSON file).
 *     A `null` or missing key means no sound for that event.
 * - All referenced .mp3 files must exist alongside the JSON when importing.
 */

const soundFileSchema = z.string().min(1).nullable();

const ImportedPackManifestSchema = z.object({
  name: z
    .string()
    .min(1, 'The "name" field is required and must be a non-empty string.'),
  description: z.string().optional(),
  sounds: z.object({
    done: soundFileSchema.optional(),
    question: soundFileSchema.optional(),
    error: soundFileSchema.optional(),
  }),
});

interface ImportedPackManifest {
  name: string;
  description?: string;
  sounds: Partial<Record<SoundEvent, string | null>>;
}

/** Union return type for {@link importPack}. */
export type ImportPackResult =
  | { id: string; name: string; error?: never }
  | { id?: never; name?: never; error: string };

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Metadata for a registered audio player (keyed by pack name). */
interface AudioPlayer {
  /** Preloaded AudioBuffer, keyed by event type. */
  buffers: Partial<Record<SoundEvent, ArrayBuffer>>;
  /** Pre-encoded data URLs so playback does not base64-encode on trigger. */
  dataUrls: Partial<Record<SoundEvent, string>>;
  /** Per-event resolved file paths (null = missing / not loaded). */
  paths: Partial<Record<SoundEvent, string>>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class NotificationSoundsService extends DisposableService {
  private readonly logger: Logger;
  private readonly uiKarton: KartonService;

  /** Path to built-in sounds (absolute, resolved at construction). */
  private readonly soundsDir: string;

  /** Path to user-imported sound packs (in userData). */
  private readonly importedPacksDir: string;

  /** Currently loaded players, keyed by pack name. */
  private players = new Map<string, AudioPlayer>();

  /** Current pack name (synced from GlobalConfig). */
  private activePack = DEFAULT_SOUND_PACK;

  /** Whether sounds are globally enabled. */
  private soundsEnabled = true;

  /** Playback loudness. `subtle` is -12 dB, `off` suppresses audio. */
  private soundLoudness: SoundLoudness = 'subtle';

  /** Whether the macOS dock should bounce. */
  private dockBounceEnabled = true;

  /** Reference to the web contents for executing audio playback JS. */
  private webContentsRef: (() => WebContents | null) | null = null;

  /** Reference to the main window for focus checks. */
  private windowRef: (() => BaseWindow | null) | null = null;

  /** Debounce: timestamp of the last sound played (ms since epoch).
   *  Reset to 0 when the window regains focus. */
  private lastSoundPlayedAt = 0;

  /** Cooldown between consecutive low-priority done notifications. */
  private readonly DEBOUNCE_MS = 10_000;

  // ------------------------------------------------------------------
  // Construction
  // ------------------------------------------------------------------

  private constructor(
    logger: Logger,
    uiKarton: KartonService,
    soundsDir: string,
    importedPacksDir: string,
    config: GlobalConfig,
  ) {
    super();
    this.logger = logger;
    this.uiKarton = uiKarton;
    this.soundsDir = soundsDir;
    this.importedPacksDir = importedPacksDir;

    this.soundLoudness = normalizeLoudness(config);
    this.soundsEnabled = this.soundLoudness !== 'off';
    this.dockBounceEnabled = config.dockBounceEnabled ?? true;
    this.activePack = this.resolveValidPack(
      config.notificationSoundPack ?? DEFAULT_SOUND_PACK,
    );
  }

  static async create(
    logger: Logger,
    uiKarton: KartonService,
    soundsDir: string,
    importedPacksDir: string,
    config: GlobalConfig,
  ): Promise<NotificationSoundsService> {
    const instance = new NotificationSoundsService(
      logger,
      uiKarton,
      soundsDir,
      importedPacksDir,
      config,
    );
    await instance.initialize();
    return instance;
  }

  // ------------------------------------------------------------------
  // Initialization
  // ------------------------------------------------------------------

  private async initialize(): Promise<void> {
    // Load the initial pack.
    await this.loadPack(this.activePack);

    this.logger.debug(
      `[NotificationSoundsService] Initialized (pack="${this.activePack}", loudness=${this.soundLoudness}, dockBounce=${this.dockBounceEnabled})`,
    );
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  setWebContentsRef(ref: () => WebContents | null): void {
    this.webContentsRef = ref;
  }

  setWindowRef(ref: () => BaseWindow | null): void {
    this.windowRef = ref;
  }

  /** Push discovered packs to a callback (e.g. to sync into GlobalConfig). */
  pushDiscoveredPacks(cb: (packs: string[]) => void): void {
    const packs = this.listPacks();
    if (packs.length > 0) cb(packs);
  }

  /**
   * Called when global config changes — syncs enabled/pack/dockBounce settings.
   */
  onConfigUpdated(newConfig: GlobalConfig): void {
    const prevPack = this.activePack;
    this.soundLoudness = normalizeLoudness(newConfig);
    this.soundsEnabled = this.soundLoudness !== 'off';
    this.dockBounceEnabled = newConfig.dockBounceEnabled ?? true;
    this.activePack = this.resolveValidPack(
      newConfig.notificationSoundPack ?? DEFAULT_SOUND_PACK,
    );

    if (this.activePack !== prevPack) {
      void this.loadPack(this.activePack);
    }

    this.logger.debug(
      `[NotificationSoundsService] Config updated (pack="${this.activePack}", loudness=${this.soundLoudness}, dockBounce=${this.dockBounceEnabled})`,
    );
  }

  /** Handle an explicit semantic notification event emitted by an agent. */
  notifyAgentEvent(event: SoundEvent, agentId: string): void {
    void this.triggerNotification(event, agentId);
  }

  /** Play the done sound for a pack so the user can preview it in settings. */
  async previewPackDoneSound(
    packName: string,
    loudness: SoundLoudness,
  ): Promise<boolean> {
    const resolvedPack = this.resolveValidPack(packName);
    await this.loadPack(resolvedPack);
    const player = this.players.get(resolvedPack);
    if (!player) return false;

    if (loudness === 'off') return false;

    return this.playFromBuffer(
      'done',
      player,
      SOUND_VOLUME[loudness],
      resolvedPack,
    );
  }

  /** List available sound pack IDs (directory names). */
  listPacks(): string[] {
    const packs = new Set<string>();
    // Built-in packs.
    try {
      for (const e of fs.readdirSync(this.soundsDir, { withFileTypes: true })) {
        if (e.isDirectory()) packs.add(e.name);
      }
    } catch (err) {
      this.logger.debug(
        `[NotificationSoundsService] Built-in sounds dir not readable: ${this.soundsDir} (${(err as Error).message})`,
      );
    }
    // Imported packs.
    try {
      for (const e of fs.readdirSync(this.importedPacksDir, {
        withFileTypes: true,
      })) {
        if (e.isDirectory()) packs.add(e.name);
      }
    } catch {
      /* no imported dir yet — expected on first launch */
    }
    return [...packs].sort();
  }

  /**
   * Returns a map of pack ID → display name.
   * Display names are read from pack.json when present, otherwise the pack ID
   * is capitalized as a fallback.
   */
  getPackDisplayNames(): Record<string, string> {
    const names: Record<string, string> = {};
    for (const packId of this.listPacks()) {
      names[packId] = this.resolvePackDisplayName(packId);
    }
    return names;
  }

  /**
   * Import a custom sound from either:
   * - a single .mp3 file, reused for all notification events, or
   * - a JSON manifest following the {@link ImportedPackManifest} format.
   *
   * Referenced .mp3 files are resolved relative to the JSON file's directory.
   * Everything is copied into a randomly-named folder under the
   * imported-packs directory.
   */
  async importPack(filePath: string): Promise<ImportPackResult> {
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith('.mp3')) {
      return this.importSingleMp3(filePath);
    }
    if (!lowerPath.endsWith('.json')) {
      return {
        error: 'Select an .mp3 file or a sound pack .json manifest.',
      };
    }
    return this.importManifestPack(filePath);
  }

  private importSingleMp3(mp3FilePath: string): ImportPackResult {
    const fileName = path.basename(mp3FilePath);
    const displayName = path.basename(mp3FilePath, path.extname(mp3FilePath));
    const validationError = this.validateMp3File(mp3FilePath, fileName);
    if (validationError) return { error: validationError };

    const packId = crypto.randomUUID();
    const packDir = path.join(this.importedPacksDir, packId);
    try {
      fs.mkdirSync(packDir, { recursive: true });
      for (const event of ['done', 'question', 'error'] as SoundEvent[]) {
        fs.copyFileSync(mp3FilePath, path.join(packDir, `${event}.mp3`));
      }
      const packMeta: ImportedPackManifest = {
        name: displayName,
        description: 'Custom sound imported from a single MP3 file.',
        sounds: {
          done: 'done.mp3',
          question: 'question.mp3',
          error: 'error.mp3',
        },
      };
      fs.writeFileSync(
        path.join(packDir, 'pack.json'),
        JSON.stringify(packMeta, null, 2),
        'utf-8',
      );
    } catch (err) {
      try {
        fs.rmSync(packDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
      const message = `Failed to import MP3: ${(err as Error).message}`;
      this.logger.warn(`[NotificationSoundsService] ${message}`);
      return { error: message };
    }

    this.logger.debug(
      `[NotificationSoundsService] Imported custom MP3 "${displayName}" (id=${packId})`,
    );
    return { id: packId, name: displayName };
  }

  private importManifestPack(jsonFilePath: string): ImportPackResult {
    // 1. Read and validate the manifest.
    let manifest: ImportedPackManifest;
    try {
      const raw = fs.readFileSync(jsonFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const result = ImportedPackManifestSchema.safeParse(parsed);
      if (!result.success) {
        const messages = result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        this.logger.warn(
          `[NotificationSoundsService] Invalid pack JSON: ${messages}`,
        );
        return { error: `Invalid sound pack JSON: ${messages}` };
      }
      manifest = result.data;
    } catch (err) {
      const message =
        err instanceof SyntaxError
          ? 'The file is not valid JSON.'
          : `Failed to read file: ${(err as Error).message}`;
      this.logger.warn(
        `[NotificationSoundsService] Pack JSON error: ${message}`,
      );
      return { error: message };
    }

    const sourceDir = path.dirname(jsonFilePath);

    // 2. At least one sound must be specified.
    const soundNames = Object.values(manifest.sounds).filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );
    if (soundNames.length === 0) {
      return {
        error:
          'The sound pack must specify at least one sound file (done, question, or error).',
      };
    }

    // 3. Create a unique directory for the imported pack.
    const packId = crypto.randomUUID();
    const packDir = path.join(this.importedPacksDir, packId);

    try {
      fs.mkdirSync(packDir, { recursive: true });
    } catch (err) {
      const message = `Failed to create pack directory: ${(err as Error).message}`;
      this.logger.warn(`[NotificationSoundsService] ${message}`);
      return { error: message };
    }

    // 4. Copy referenced .mp3 files.
    const copiedSounds: Partial<Record<SoundEvent, string>> = {};
    const errors: string[] = [];
    for (const event of ['done', 'question', 'error'] as SoundEvent[]) {
      const filename = manifest.sounds[event];
      if (!filename || typeof filename !== 'string') continue;

      const src = path.resolve(sourceDir, filename);
      // Security: ensure the resolved path stays within sourceDir.
      if (!src.startsWith(sourceDir + path.sep) && src !== sourceDir) {
        this.logger.warn(
          `[NotificationSoundsService] Rejected path traversal: ${filename}`,
        );
        errors.push(`"${filename}" must be relative to the manifest file.`);
        continue;
      }
      const validationError = this.validateMp3File(src, filename);
      if (validationError) {
        errors.push(validationError);
        continue;
      }

      const dest = path.join(packDir, `${event}.mp3`);
      try {
        fs.copyFileSync(src, dest);
        copiedSounds[event] = dest;
      } catch (err) {
        this.logger.warn(
          `[NotificationSoundsService] Failed to copy ${filename}: ${(err as Error).message}`,
        );
      }
    }

    // At least one sound file must have been copied successfully.
    if (Object.keys(copiedSounds).length === 0) {
      this.logger.warn(
        '[NotificationSoundsService] No sound files were imported; removing pack dir',
      );
      try {
        fs.rmSync(packDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
      const detail = errors.length > 0 ? ` ${errors.join(' ')}` : '';
      return { error: `No valid sound files found.${detail}` };
    }

    // 4. Write pack.json into the imported pack directory.
    const packMeta: ImportedPackManifest = {
      name: manifest.name,
      description: manifest.description,
      sounds: {},
    };
    for (const event of ['done', 'question', 'error'] as SoundEvent[]) {
      packMeta.sounds[event] = copiedSounds[event] ? `${event}.mp3` : null;
    }

    try {
      fs.writeFileSync(
        path.join(packDir, 'pack.json'),
        JSON.stringify(packMeta, null, 2),
        'utf-8',
      );
    } catch (err) {
      this.logger.warn(
        `[NotificationSoundsService] Failed to write pack.json: ${(err as Error).message}`,
      );
      // Non-fatal — the pack still works, just without metadata.
    }

    // 6. Log import errors as a single warning if some files failed.
    if (errors.length > 0) {
      this.logger.warn(
        `[NotificationSoundsService] Import warnings for "${manifest.name}": ${errors.join(' ')}`,
      );
    }

    this.logger.debug(
      `[NotificationSoundsService] Imported pack "${manifest.name}" (id=${packId}, ${Object.keys(copiedSounds).length} sounds)`,
    );
    return { id: packId, name: manifest.name };
  }

  private validateMp3File(
    filePath: string,
    displayName: string,
  ): string | null {
    if (!filePath.toLowerCase().endsWith('.mp3')) {
      return `"${displayName}" is not an .mp3 file.`;
    }
    if (!fs.existsSync(filePath)) {
      return `Sound file "${displayName}" not found.`;
    }
    // Quick header check — valid MP3 starts with sync byte 0xFF followed by
    // 0xE0–0xFF or an ID3 tag ("ID3").
    try {
      const header = Buffer.alloc(3);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, header, 0, 3, 0);
      fs.closeSync(fd);
      const isId3 =
        header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33;
      const isFrameSync = header[0] === 0xff && (header[1] & 0xe0) === 0xe0;
      if (!isId3 && !isFrameSync) {
        return `"${displayName}" does not appear to be a valid MP3 file.`;
      }
    } catch {
      return `Failed to read "${displayName}". The file may be corrupted.`;
    }
    return null;
  }

  /**
   * Ensure the given pack ID exists. If not (e.g. an imported pack was
   * deleted), fall back to the default pack. Returns the valid pack ID.
   */
  private resolveValidPack(packId: string): string {
    const available = this.listPacks();
    if (available.includes(packId)) return packId;
    this.logger.warn(
      `[NotificationSoundsService] Pack "${packId}" not found, falling back to "${DEFAULT_SOUND_PACK}"`,
    );
    if (!available.includes(DEFAULT_SOUND_PACK)) {
      return available.length > 0 ? available[0] : DEFAULT_SOUND_PACK;
    }
    return DEFAULT_SOUND_PACK;
  }

  /** Resolve the human-readable display name for a pack ID. */
  private resolvePackDisplayName(packId: string): string {
    for (const baseDir of [this.importedPacksDir, this.soundsDir]) {
      const manifestPath = path.join(baseDir, packId, 'pack.json');
      try {
        if (fs.existsSync(manifestPath)) {
          const meta = JSON.parse(
            fs.readFileSync(manifestPath, 'utf-8'),
          ) as ImportedPackManifest;
          if (meta.name) return meta.name;
        }
      } catch {
        /* fall through */
      }
    }
    return packId.charAt(0).toUpperCase() + packId.slice(1);
  }

  // ------------------------------------------------------------------
  // Teardown
  // ------------------------------------------------------------------

  protected onTeardown(): void {
    this.players.clear();
    this.logger.debug('[NotificationSoundsService] Teardown complete');
  }

  // ------------------------------------------------------------------
  // Sound pack loading
  // ------------------------------------------------------------------

  private async loadPack(packName: string): Promise<void> {
    if (this.players.has(packName)) return; // Already loaded.

    // Try built-in first, then imported.
    let packDir = path.join(this.soundsDir, packName);
    if (!fs.existsSync(packDir)) {
      packDir = path.join(this.importedPacksDir, packName);
    }
    if (!fs.existsSync(packDir)) {
      this.logger.warn(
        `[NotificationSoundsService] Sound pack "${packName}" not found`,
      );
      return;
    }

    const player: AudioPlayer = { buffers: {}, dataUrls: {}, paths: {} };
    for (const event of ['done', 'question', 'error'] as SoundEvent[]) {
      const filePath = path.join(packDir, `${event}.mp3`);
      if (fs.existsSync(filePath)) {
        player.paths[event] = filePath;
        try {
          const fileBuffer = fs.readFileSync(filePath);
          const buffer = fileBuffer.buffer.slice(
            fileBuffer.byteOffset,
            fileBuffer.byteOffset + fileBuffer.byteLength,
          ) as ArrayBuffer;
          player.buffers[event] = buffer;
          const dataUrl = bufferToDataUrl(buffer, 'audio/mpeg');
          if (dataUrl) player.dataUrls[event] = dataUrl;
        } catch (err) {
          this.logger.warn(
            `[NotificationSoundsService] Failed to read ${filePath}: ${(err as Error).message}`,
          );
        }
      }
    }

    this.players.set(packName, player);
    this.logger.debug(
      `[NotificationSoundsService] Loaded sound pack "${packName}" (${Object.keys(player.paths).length} sounds)`,
    );
  }

  // ------------------------------------------------------------------
  // Trigger notification
  // ------------------------------------------------------------------

  private async triggerNotification(
    event: SoundEvent,
    agentId: string,
  ): Promise<void> {
    const windowFocused = this.isWindowFocused();

    // Reset debounce cooldown if the user has focused the window.
    if (windowFocused) {
      this.lastSoundPlayedAt = 0;
    }

    // Debounce low-priority done notifications only. Approval/question/error
    // must not be suppressed by a previous done sound.
    if (
      event === 'done' &&
      Date.now() - this.lastSoundPlayedAt < this.DEBOUNCE_MS
    ) {
      return;
    }

    // Skip only when the triggering agent is currently visible to the user.
    // If the app window is out of focus, the selected agent is not actually
    // visible, so it should still notify.
    if (
      this.uiKarton.state.browser.lastOpenAgentId === agentId &&
      windowFocused
    ) {
      return;
    }

    let delivered = false;

    // Play sound if enabled.
    if (this.soundsEnabled) {
      delivered = (await this.playSound(event)) || delivered;
    }

    // Bounce dock if enabled and on macOS and window is not focused.
    if (this.dockBounceEnabled && process.platform === 'darwin') {
      if (!windowFocused) {
        delivered = this.bounceDock(event) || delivered;
      }
    }

    if (delivered) {
      this.lastSoundPlayedAt = Date.now();
    }
  }

  // ------------------------------------------------------------------
  // Sound playback
  // ------------------------------------------------------------------

  private async playSound(event: SoundEvent): Promise<boolean> {
    const player = this.players.get(this.activePack);
    if (!player) {
      // Try to load the pack lazily.
      await this.loadPack(this.activePack);
      const loaded = this.players.get(this.activePack);
      if (!loaded) return false;
      return this.playFromBuffer(event, loaded);
    }

    return this.playFromBuffer(event, player);
  }

  private async playFromBuffer(
    event: SoundEvent,
    player: AudioPlayer,
    volume = SOUND_VOLUME[this.soundLoudness],
    packName = this.activePack,
  ): Promise<boolean> {
    const buffer = player.buffers[event];
    if (!buffer) {
      this.logger.debug(
        `[NotificationSoundsService] No "${event}" sound in pack "${packName}"`,
      );
      return false;
    }

    const filePath = player.paths[event];
    if (!filePath) return false;

    const dataUrl = player.dataUrls[event];
    if (!dataUrl) {
      this.logger.debug(
        `[NotificationSoundsService] Missing pre-encoded "${event}" data URL for pack "${packName}"`,
      );
      return false;
    }
    return this.sendPlayRequest(dataUrl, volume);
  }

  /**
   * Sends a play-sound request to the renderer by executing JavaScript
   * in the main window. The renderer creates a short-lived Audio element.
   */
  private async sendPlayRequest(
    dataUrl: string,
    volume: number,
  ): Promise<boolean> {
    const wc = this.webContentsRef?.();
    if (!wc || wc.isDestroyed()) {
      this.logger.debug(
        '[NotificationSoundsService] Skipping play — no valid web contents',
      );
      return false;
    }

    try {
      // Escape single quotes and backticks for JS string safety.
      const safeUrl = dataUrl
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/`/g, '\\`');

      const code = `
        (function(){
          try {
            var a = new Audio('${safeUrl}');
            a.volume = ${Math.max(0, Math.min(1, volume))};
            a.play().catch(function(){});
          } catch(_){}
        })();
      `;

      await wc.executeJavaScript(code);
      return true;
    } catch (err) {
      this.logger.debug(
        `[NotificationSoundsService] sendPlayRequest failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Dock bouncing (macOS only)
  // ------------------------------------------------------------------

  private bounceDock(event: SoundEvent): boolean {
    // macOS only exposes two modes: 'informational' (one bounce) and
    // 'critical' (indefinite). No duration API. Use 'informational' for
    // all events to avoid annoying the user with permanent bouncing.
    const type: 'informational' | 'critical' = 'informational';

    try {
      if (!app.dock) return false;
      app.dock.bounce(type);
      this.logger.debug(
        `[NotificationSoundsService] Dock bounce (type="${type}", event="${event}")`,
      );
      return true;
    } catch (err) {
      this.logger.debug(
        `[NotificationSoundsService] Dock bounce failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Window focus check
  // ------------------------------------------------------------------

  private isWindowFocused(): boolean {
    const win = this.windowRef?.();
    if (!win || win.isDestroyed()) return false;
    return win.isFocused();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeLoudness(config: GlobalConfig): SoundLoudness {
  const loudness = (
    config as GlobalConfig & {
      notificationSoundLoudness?: SoundLoudness;
    }
  ).notificationSoundLoudness;
  if (loudness === 'off' || loudness === 'subtle' || loudness === 'default') {
    return loudness;
  }
  // Backwards compatibility for existing configs.
  return config.notificationSoundsEnabled === false ? 'off' : 'subtle';
}

function bufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string | null {
  try {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    // Process in chunks to avoid call-stack overflow on large buffers.
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}
