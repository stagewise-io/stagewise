import type { HostModels, ModelWithOptions } from '@stagewise/agent-core';
import type { ModelCapabilities } from '@stagewise/agent-core/types';
import type { ModelProviderService } from '@/agents/model-provider';
import { getModelCapabilities, type ModelId } from '@shared/available-models';

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
 * `has(id)` delegates to `ModelProviderService.modelExists`.
 */
export function createBrowserHostModels(
  modelProviderService: ModelProviderService,
): HostModels {
  async function getWithOptions(
    modelId: string,
    traceId: string,
    metadata?: Record<string, unknown>,
  ): Promise<ModelWithOptions> {
    try {
      const result = modelProviderService.getModelWithOptions(
        modelId as ModelId,
        traceId,
        metadata,
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
    has(modelId) {
      return modelProviderService.modelExists(modelId as ModelId);
    },
    getCapabilities(modelId): ModelCapabilities {
      return getModelCapabilities(modelId as ModelId) as ModelCapabilities;
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

export function createLazyBrowserHostModels(): LazyBrowserHostModels {
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
    has(modelId) {
      if (!inner) return false;
      return inner.has(modelId);
    },
    getCapabilities(modelId) {
      // Capability lookup is pure metadata derived from the static
      // catalog, so it works without `ModelProviderService`. Delegate
      // to a no-arg adapter when the bridge has not been wired yet.
      if (inner) return inner.getCapabilities(modelId);
      return getModelCapabilities(modelId as ModelId) as ModelCapabilities;
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
      inner = createBrowserHostModels(mp);
    },
  };
}
