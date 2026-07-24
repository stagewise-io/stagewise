import type { UtilityModelEntry } from '../host/models';

/**
 * Duration (ms) that a fallback model selection persists after the
 * last message. Once this window expires, the manager resets to the
 * primary model (index 0) on the next `resolveModelIndex` call.
 */
export const FALLBACK_PERSISTENCE_MS = 5 * 60 * 1000;

/**
 * Manages automatic failover for the main chat model when a preset is
 * active. When the primary model fails with an upstream-overload error
 * (429, 502, 503, 529), the manager advances to the next model in the
 * preset's fallback list. The fallback persists for
 * {@link FALLBACK_PERSISTENCE_MS} after the last message, then resets
 * to the primary. Changing the preset resets the pointer to index 0.
 *
 * All state logic is pure and synchronous; `BaseAgent` is responsible
 * for wiring it into `runStep` and `onError`.
 */
export class ModelFallbackManager {
  /**
   * The current fallback index within the preset's model list.
   * `0` means the primary model is in use (no fallback active).
   */
  private _fallbackModelIndex = 0;

  /**
   * Timestamp (ms since epoch) at which the fallback was activated.
   * Used to compute the 5-minute persistence window. Reset to `0`
   * when the manager returns to the primary model.
   */
  private _fallbackSetAt = 0;

  /**
   * The preset ID that was active when the fallback index was set.
   * Used to detect preset changes and reset the pointer.
   */
  private _lastPresetId: string | undefined;

  /** Returns the current fallback model index (0 = primary). */
  get fallbackModelIndex(): number {
    return this._fallbackModelIndex;
  }

  /** Returns the timestamp at which the fallback was activated. */
  get fallbackSetAt(): number {
    return this._fallbackSetAt;
  }

  /**
   * Resolves the effective model index for the current step.
   *
   * Detects preset changes (resets to index 0), checks the 5-minute
   * persistence window (resets to index 0 if expired), and touches
   * the timer on each call so the window extends with every message.
   *
   * @param presetId - The active preset ID (or `undefined` if none).
   * @param presetModels - The active preset's model list (or `undefined`).
   * @param now - Current timestamp (injectable for tests).
   * @returns The effective model index to use for this step.
   */
  resolveModelIndex(
    presetId: string | undefined,
    presetModels: UtilityModelEntry[] | undefined,
    now: number = Date.now(),
  ): number {
    // No preset active — always primary.
    if (!presetId || !presetModels || presetModels.length === 0) {
      this.reset();
      return 0;
    }

    // Preset changed — reset to primary.
    if (this._lastPresetId !== presetId) {
      this.reset();
      this._lastPresetId = presetId;
      return 0;
    }

    // Fallback active — check expiry.
    if (this._fallbackModelIndex > 0) {
      if (now - this._fallbackSetAt > FALLBACK_PERSISTENCE_MS) {
        // Window expired — reset to primary.
        this._fallbackModelIndex = 0;
        this._fallbackSetAt = 0;
        return 0;
      }
      // Touch the timer to extend the window.
      this._fallbackSetAt = now;
    }

    // Clamp index to the available models (handles edge case where
    // preset models were edited and the list shrank).
    if (this._fallbackModelIndex >= presetModels.length) {
      this._fallbackModelIndex = 0;
      this._fallbackSetAt = 0;
    }

    return this._fallbackModelIndex;
  }

  /**
   * Advances the fallback pointer after an upstream-overload error.
   *
   * Moves to the next model in the preset's list with wraparound.
   * Returns `true` if a fallback model is available (the pointer
   * advanced to a new model), or `false` if the pointer cycled back
   * to the primary (index 0) — meaning all models have been tried
   * and the error should be surfaced to the user.
   *
   * @param presetModels - The active preset's model list.
   * @param now - Current timestamp (injectable for tests).
   * @returns `true` if a fallback model was selected, `false` if
   *   all models were tried and the pointer wrapped back to 0.
   */
  advanceOnFailure(
    presetModels: UtilityModelEntry[] | undefined,
    now: number = Date.now(),
  ): boolean {
    if (!presetModels || presetModels.length <= 1) {
      return false;
    }

    const nextIndex = this._fallbackModelIndex + 1;

    // Wraparound — all models tried.
    if (nextIndex >= presetModels.length) {
      this._fallbackModelIndex = 0;
      this._fallbackSetAt = 0;
      return false;
    }

    this._fallbackModelIndex = nextIndex;
    this._fallbackSetAt = now;
    return true;
  }

  /**
   * Clears all fallback state. Called on preset change, when no
   * preset is active, or when the agent is explicitly stopped.
   */
  reset(): void {
    this._fallbackModelIndex = 0;
    this._fallbackSetAt = 0;
    this._lastPresetId = undefined;
  }
}
