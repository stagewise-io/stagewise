import { describe, expect, it } from 'vitest';
import {
  FALLBACK_PERSISTENCE_MS,
  ModelFallbackManager,
} from './model-fallback-manager';
import type { UtilityModelEntry } from '../host/models';

const T0 = 1_000_000; // arbitrary base timestamp

const models: UtilityModelEntry[] = [
  { modelId: 'model-a' },
  { modelId: 'model-b' },
  { modelId: 'model-c' },
];

const singleModel: UtilityModelEntry[] = [{ modelId: 'only-model' }];

describe('ModelFallbackManager', () => {
  // ── resolveModelIndex ────────────────────────────────────────────

  it('returns index 0 (primary) when no fallback is active', () => {
    const m = new ModelFallbackManager();
    expect(m.resolveModelIndex('preset-1', models, T0)).toBe(0);
    expect(m.fallbackModelIndex).toBe(0);
  });

  it('returns 0 and resets when no preset is active', () => {
    const m = new ModelFallbackManager();
    // Activate a fallback first
    expect(m.advanceOnFailure(models, T0)).toBe(true);
    expect(m.fallbackModelIndex).toBe(1);
    // No preset → reset
    expect(m.resolveModelIndex(undefined, undefined, T0)).toBe(0);
    expect(m.fallbackModelIndex).toBe(0);
  });

  it('returns 0 and resets when preset models list is empty', () => {
    const m = new ModelFallbackManager();
    expect(m.advanceOnFailure(models, T0)).toBe(true);
    expect(m.fallbackModelIndex).toBe(1);
    expect(m.resolveModelIndex('preset-1', [], T0)).toBe(0);
    expect(m.fallbackModelIndex).toBe(0);
  });

  // ── advanceOnFailure ─────────────────────────────────────────────

  it('cycles 0→1→2→0 and returns false at wraparound', () => {
    const m = new ModelFallbackManager();
    // Prime: resolveModelIndex sets lastPresetId
    m.resolveModelIndex('preset-1', models, T0);

    // 0→1
    expect(m.advanceOnFailure(models, T0)).toBe(true);
    expect(m.fallbackModelIndex).toBe(1);
    // 1→2
    expect(m.advanceOnFailure(models, T0 + 100)).toBe(true);
    expect(m.fallbackModelIndex).toBe(2);
    // 2→wraparound to 0
    expect(m.advanceOnFailure(models, T0 + 200)).toBe(false);
    expect(m.fallbackModelIndex).toBe(0);
    expect(m.fallbackSetAt).toBe(0);
  });

  it('returns false when no preset models', () => {
    const m = new ModelFallbackManager();
    expect(m.advanceOnFailure(undefined, T0)).toBe(false);
    expect(m.fallbackModelIndex).toBe(0);
  });

  it('returns false for single-model preset (no fallback possible)', () => {
    const m = new ModelFallbackManager();
    m.resolveModelIndex('preset-1', singleModel, T0);
    expect(m.advanceOnFailure(singleModel, T0)).toBe(false);
    expect(m.fallbackModelIndex).toBe(0);
  });

  // ── 5-minute persistence ─────────────────────────────────────────

  it('fallback persists within the 5-minute window', () => {
    const m = new ModelFallbackManager();
    m.resolveModelIndex('preset-1', models, T0);
    m.advanceOnFailure(models, T0); // activate fallback at T0, index=1

    // Within window → still on fallback
    expect(m.resolveModelIndex('preset-1', models, T0 + 60_000)).toBe(1);
    expect(m.fallbackModelIndex).toBe(1);
  });

  it('fallback expires after 5 minutes', () => {
    const m = new ModelFallbackManager();
    m.resolveModelIndex('preset-1', models, T0);
    m.advanceOnFailure(models, T0); // activate at T0, index=1

    // After 5 min + 1 ms → expired, back to primary
    expect(
      m.resolveModelIndex('preset-1', models, T0 + FALLBACK_PERSISTENCE_MS + 1),
    ).toBe(0);
    expect(m.fallbackModelIndex).toBe(0);
    expect(m.fallbackSetAt).toBe(0);
  });

  it('resolveModelIndex touches the timer, extending the window', () => {
    const m = new ModelFallbackManager();
    m.resolveModelIndex('preset-1', models, T0);
    m.advanceOnFailure(models, T0); // set at T0

    // Touch at T0 + 3min
    const touchTime = T0 + 3 * 60_000;
    m.resolveModelIndex('preset-1', models, touchTime);
    expect(m.fallbackSetAt).toBe(touchTime);

    // T0 + 5min would have expired the original window, but since we
    // touched at T0+3min, the window extends to T0+3min+5min=T0+8min.
    // So at T0+6min we're still within the window.
    expect(m.resolveModelIndex('preset-1', models, T0 + 6 * 60_000)).toBe(1);
  });

  // ── Preset change ────────────────────────────────────────────────

  it('changing the preset resets the fallback pointer to 0', () => {
    const m = new ModelFallbackManager();
    m.resolveModelIndex('preset-1', models, T0);
    m.advanceOnFailure(models, T0); // index=1
    expect(m.fallbackModelIndex).toBe(1);

    // Switch to preset-2
    expect(m.resolveModelIndex('preset-2', models, T0 + 1000)).toBe(0);
    expect(m.fallbackModelIndex).toBe(0);
    expect(m.fallbackSetAt).toBe(0);
  });

  // ── reset() ──────────────────────────────────────────────────────

  it('reset() clears all state', () => {
    const m = new ModelFallbackManager();
    m.resolveModelIndex('preset-1', models, T0);
    m.advanceOnFailure(models, T0);
    expect(m.fallbackModelIndex).toBe(1);

    m.reset();
    expect(m.fallbackModelIndex).toBe(0);
    expect(m.fallbackSetAt).toBe(0);
  });

  // ── Edge case: clamping when preset models shrink ────────────────

  it('clamps index when preset models list shrinks below current index', () => {
    const m = new ModelFallbackManager();
    m.resolveModelIndex('preset-1', models, T0);
    // Advance to index 2
    m.advanceOnFailure(models, T0);
    m.advanceOnFailure(models, T0 + 100);
    expect(m.fallbackModelIndex).toBe(2);

    // Preset edited to only 1 model — index 2 is out of bounds
    expect(m.resolveModelIndex('preset-1', singleModel, T0 + 200)).toBe(0);
    expect(m.fallbackModelIndex).toBe(0);
  });
});
