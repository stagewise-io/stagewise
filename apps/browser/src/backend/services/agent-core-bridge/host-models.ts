import type { HostModels, ModelWithOptions } from '@stagewise/agent-core';
import type { ModelCapabilities } from '@stagewise/agent-core/types';
import type { ModelProviderService } from '@/agents/model-provider';
import { getModelCapabilities, type ModelId } from '@shared/available-models';
import {
  PROVIDER_INSTANCE_ID_METADATA_KEY,
  type UtilityModelEntry as CoreUtilityModelEntry,
} from '@stagewise/agent-core/host';
import type { UserPreferences } from '@shared/karton-contracts/ui/shared-types';

/**
 * Thin `HostModels` adapter over the browser's `ModelProviderService`.
 *
 * `getWithOptions(id, traceId, metadata)` returns the full
 * {@link ModelWithOptions} payload — including provider options,
 * headers, provider mode, context-window size, and the
 * `stripStrictFromTools` flag — sourced directly from
 * `ModelProviderService.getModelWithOptions`. `metadata` is forwarded
 * as the optional PostHog-property bag so host telemetry middleware
 * can enrich traces.
 *
 * `get(id, traceId)` is a backward-compatible convenience that
 * delegates to `getWithOptions` and returns only the model.
 *
 * Errors from the underlying service are re-thrown unchanged when
 * they are already `Error` instances; other thrown values are
 * normalized into `Error` so callers receive a consistent rejection
 * shape.
 *
 * `has(id, providerInstanceId)` delegates to `ModelProviderService.modelExists`.
 * Instance-scoped discovered models require their provider instance ID.
 */
/**
 * Getter that returns the current agent preferences block from user
 * preferences. Called on every utility-model resolution and on every
 * `runStep` model resolution; must be cheap.
 * Includes `activePresetId` and `modelPresets` so per-preset utility
 * model overrides and the active preset's main model can be resolved.
 */
export type UtilityModelsGetter = () => Pick<
  UserPreferences['agent'],
  'utilityModels' | 'activePresetId' | 'modelPresets'
>;

/**
 * Resolves the ordered utility model entries for a given task,
 * checking the active preset's overrides first, then falling back
 * to global configuration. The global lists are always populated
 * by schema defaults, so this returns `undefined` only when no
 * preset is active and the global list is empty (explicitly cleared).
 */
function resolveUtilityEntries(
  task: 'title-generation' | 'context-compression',
  prefs: Pick<
    UserPreferences['agent'],
    'utilityModels' | 'activePresetId' | 'modelPresets'
  >,
): CoreUtilityModelEntry[] | undefined {
  const { utilityModels, activePresetId, modelPresets } = prefs;
  // If an active preset exists, its utility model lists take
  // precedence over the global defaults. An undefined or empty list
  // means "use the main model" — we return [] so agent-core falls
  // back to fallbackModelId (the preset's main model) instead of
  // falling through to global defaults.
  if (activePresetId) {
    const preset = modelPresets.find((p) => p.id === activePresetId);
    if (preset) {
      const presetList =
        task === 'title-generation'
          ? preset.titleGeneration
          : preset.contextCompression;
      if (presetList && presetList.length > 0) {
        return presetList.map(toCoreEntry);
      }
      return [];
    }
  }
  const globalList =
    task === 'title-generation'
      ? utilityModels.titleGeneration
      : utilityModels.contextCompression;
  return globalList?.map(toCoreEntry);
}

/**
 * Resolves the active preset's ID from user preferences.
 * Returns `undefined` when no preset is active.
 */
function resolveActivePresetId(
  prefs: Pick<UserPreferences['agent'], 'activePresetId'>,
): string | undefined {
  return prefs.activePresetId ?? undefined;
}

/**
 * Resolves the active preset's full ordered list of model entries
 * (main model first, then fallbacks) from user preferences.
 * Returns `undefined` when no preset is active or the preset has
 * no models. Each entry carries optional `providerInstanceId` and
 * `thinkingOverride` so the agent can cycle through them on failure.
 */
function resolveActivePresetModels(
  prefs: Pick<UserPreferences['agent'], 'activePresetId' | 'modelPresets'>,
): CoreUtilityModelEntry[] | undefined {
  const { activePresetId, modelPresets } = prefs;
  if (!activePresetId) return undefined;
  const preset = modelPresets.find((p) => p.id === activePresetId);
  if (!preset) return undefined;
  const models = preset.models;
  if (!models || models.length === 0) return undefined;
  return models.map(toCoreEntry);
}

/**
 * The shapes are structurally identical, but keeping an explicit
 * mapping avoids accidental drift.
 */
function toCoreEntry(entry: {
  modelId: string;
  providerInstanceId?: string;
  thinkingOverride?: CoreUtilityModelEntry['thinkingOverride'];
}): CoreUtilityModelEntry {
  return {
    modelId: entry.modelId,
    ...(entry.providerInstanceId
      ? { providerInstanceId: entry.providerInstanceId }
      : {}),
    ...(entry.thinkingOverride
      ? { thinkingOverride: entry.thinkingOverride }
      : {}),
  };
}

export function createBrowserHostModels(
  modelProviderService: ModelProviderService,
  getUtilityModels?: UtilityModelsGetter,
): HostModels {
  async function getWithOptions(
    modelId: string,
    traceId: string,
    metadata?: Record<string, unknown>,
  ): Promise<ModelWithOptions> {
    try {
      // Extract providerInstanceId from metadata when present (PR 3
      // model × instance architecture). agent-core passes it via the
      // reserved metadata key so the routing layer can resolve the
      // correct instance.
      const providerInstanceId = metadata?.[
        PROVIDER_INSTANCE_ID_METADATA_KEY
      ] as string | undefined;
      const telemetryMetadata = metadata
        ? Object.fromEntries(
            Object.entries(metadata).filter(
              ([key]) => key !== PROVIDER_INSTANCE_ID_METADATA_KEY,
            ),
          )
        : undefined;
      const result = modelProviderService.getModelWithOptions(
        modelId as ModelId,
        traceId,
        telemetryMetadata,
        providerInstanceId,
      );
      return result as ModelWithOptions;
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error(String(error));
    }
  }

  return {
    getWithOptions,
    async get(modelId, traceId) {
      const { model } = await getWithOptions(modelId, traceId);
      return model;
    },
    has(modelId, providerInstanceId) {
      return modelProviderService.modelExists(
        modelId as ModelId,
        providerInstanceId,
      );
    },
    getCapabilities(modelId): ModelCapabilities {
      return getModelCapabilities(modelId as ModelId) as ModelCapabilities;
    },
    getUtilityModelEntries(task) {
      if (!getUtilityModels) return undefined;
      return resolveUtilityEntries(task, getUtilityModels());
    },
    getActivePresetId() {
      if (!getUtilityModels) return undefined;
      return resolveActivePresetId(getUtilityModels());
    },
    getActivePresetModels() {
      if (!getUtilityModels) return undefined;
      return resolveActivePresetModels(getUtilityModels());
    },
  };
}

/**
 * Lazy `HostModels` wrapper used to assemble the `AgentHost` before
 * `ModelProviderService` exists in `main.ts`'s boot sequence.
 *
 * Returns a `HostModels` whose methods throw until
 * `setModelProviderService(...)` is called exactly once. Once set, all
 * subsequent calls delegate to a regular `createBrowserHostModels`
 * adapter.
 *
 * Boot-order rationale (Phase 5, D2): `DiffHistoryService` requires
 * `AgentHost.paths` / `.logger` / `.telemetry` and constructs early
 * (right after `createAgentCoreSeam`), well before `authService` and
 * therefore `modelProviderService` are available. The service itself
 * never touches `host.models`, so the lazy proxy is invisible in
 * practice; it only matters for any agent-core code that *does* try to
 * resolve a model before the bridge attaches.
 */
export interface LazyBrowserHostModels {
  hostModels: HostModels;
  setModelProviderService(mp: ModelProviderService): void;
}

export function createLazyBrowserHostModels(
  getUtilityModels?: UtilityModelsGetter,
): LazyBrowserHostModels {
  let inner: HostModels | null = null;

  const hostModels: HostModels = {
    async getWithOptions(modelId, traceId, metadata) {
      if (!inner) {
        throw new Error(
          `[BrowserHostModels] ModelProviderService not initialized yet; cannot resolve model ${modelId}`,
        );
      }
      return inner.getWithOptions(modelId, traceId, metadata);
    },
    async get(modelId, traceId) {
      if (!inner) {
        throw new Error(
          `[BrowserHostModels] ModelProviderService not initialized yet; cannot resolve model ${modelId}`,
        );
      }
      return inner.get(modelId, traceId);
    },
    has(modelId, providerInstanceId) {
      if (!inner) return false;
      return inner.has(modelId, providerInstanceId);
    },
    getCapabilities(modelId) {
      // Capability lookup is pure metadata derived from the static
      // catalog, so it works without `ModelProviderService`. Delegate
      // to a no-arg adapter when the bridge has not been wired yet.
      if (inner) return inner.getCapabilities(modelId);
      return getModelCapabilities(modelId as ModelId) as ModelCapabilities;
    },
    getUtilityModelEntries(task) {
      if (inner?.getUtilityModelEntries)
        return inner.getUtilityModelEntries(task);
      if (!getUtilityModels) return undefined;
      return resolveUtilityEntries(task, getUtilityModels());
    },
    getActivePresetId() {
      if (inner?.getActivePresetId) return inner.getActivePresetId();
      if (!getUtilityModels) return undefined;
      return resolveActivePresetId(getUtilityModels());
    },
    getActivePresetModels() {
      if (inner?.getActivePresetModels) return inner.getActivePresetModels();
      if (!getUtilityModels) return undefined;
      return resolveActivePresetModels(getUtilityModels());
    },
  };

  return {
    hostModels,
    setModelProviderService(mp) {
      if (inner) {
        throw new Error(
          '[BrowserHostModels] setModelProviderService called twice',
        );
      }
      inner = createBrowserHostModels(mp, getUtilityModels);
    },
  };
}
