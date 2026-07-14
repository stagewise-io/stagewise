import type {
  DiscoveredModel,
  ModelProvider,
} from './karton-contracts/ui/shared-types';
import { availableModels } from './available-models';
import {
  CODING_PLANS,
  type CodingPlanId,
  isCodingPlanId,
} from './coding-plans';

// ============================================================================
// Flagship model curation for API providers
// ============================================================================
//
// When a provider API returns a large number of discovered models (e.g.
// OpenRouter returns 343, OpenAI returns 68), only "flagship" models are
// enabled in the chat model selector by default. Non-flagship models are
// auto-disabled (added to the instance's `disabledModelIds`) but remain
// visible and toggleable in the settings page (which passes
// `includeDisabled: true`).
//
// Catalog models (from `available-models.ts`) are always considered
// flagship — they carry rich metadata and are curated. The registries
// below only cover *discovered models that are NOT in the catalog*.
// ============================================================================

// ── OpenRouter ──────────────────────────────────────────────────────────────
//
// OpenRouter has no catalog — all models are discovered. This set defines
// the curated flagship list across all vendors available on OpenRouter.
// Model IDs are lowercase (OpenRouter IDs are case-insensitive in practice).

const OPENROUTER_FLAGSHIP_MODELS = new Set<string>([
  // Anthropic
  'anthropic/claude-sonnet-5',
  'anthropic/claude-opus-4.8',
  'anthropic/claude-fable-5',
  'anthropic/claude-opus-4.7',
  // OpenAI
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-luna',
  'openai/gpt-5.5',
  'openai/o3',
  'openai/o4-mini',
  // Google
  'google/gemini-3.5-flash',
  'google/gemini-3.1-pro-preview',
  'google/gemini-3.1-flash-lite',
  // DeepSeek
  'deepseek/deepseek-v4-pro',
  'deepseek/deepseek-v4-flash',
  'deepseek/deepseek-r1',
  // Z.AI
  'z-ai/glm-5.2',
  'z-ai/glm-5.1',
  // MoonshotAI
  'moonshotai/kimi-k2.7-code',
  'moonshotai/kimi-k2.6',
  // xAI
  'x-ai/grok-4.5',
  'x-ai/grok-4.20',
  // Mistral
  'mistralai/mistral-medium-3-5',
  'mistralai/codestral-2508',
  // NVIDIA
  'nvidia/nemotron-3-ultra-550b-a55b',
  // Qwen
  'qwen/qwen3-coder-plus',
  'qwen/qwen3.7-plus',
  // Poolside
  'poolside/laguna-xs-2.1',
]);

// ── Vendor API: discovered-only flagship models ────────────────────────────
//
// For vendor APIs (openai-api, deepseek-api, etc.), catalog models are
// always flagship. This map covers only *discovered models that are NOT
// in the catalog* but should also be enabled by default. Most vendors have
// no entries because their catalog already covers their flagships.

const VENDOR_FLAGSHIP_DISCOVERED_MODELS: Partial<
  Record<ModelProvider, Set<string>>
> = {
  openai: new Set([
    'gpt-5.6-sol-pro',
    'gpt-5.6-terra-pro',
    'gpt-5.6-luna-pro',
    'gpt-5.5-pro',
    'gpt-5.4-pro',
    'o3',
    'o4-mini',
    'o3-mini',
  ]),
  deepseek: new Set(['deepseek-reasoner']),
};

// ── Catalog model IDs by vendor (pre-computed) ──────────────────────────────

const CATALOG_MODEL_IDS_BY_VENDOR: Partial<Record<ModelProvider, Set<string>>> =
  (() => {
    const map: Partial<Record<ModelProvider, Set<string>>> = {};
    for (const model of availableModels) {
      const vendor = model.officialProvider;
      if (!map[vendor]) map[vendor] = new Set();
      map[vendor]!.add(model.modelId.toLowerCase());
    }
    return map;
  })();

// ── Flagship filtering: which types get filtered ───────────────────────────

/**
 * Returns `true` for provider types where non-flagship discovered models
 * should be auto-disabled. Returns `false` for:
 * - `ollama` — all user-pulled models are equal, no curation.
 * - `stagewise` — catalog-only, no discovered models.
 * - `anthropic-api` — no discovery (no model listing endpoint).
 * - `custom-*`, `azure`, `bedrock`, `vertex` — user-configured, no curation.
 */
export function isFlagshipFilteringEnabled(typeId: string): boolean {
  if (typeId === 'openrouter') return true;
  if (typeId === 'coding-plan') return true;
  // Vendor API types end in '-api'
  if (typeId.endsWith('-api') && typeId !== 'anthropic-api') return true;
  return false;
}

// ── Core filtering logic ────────────────────────────────────────────────────

/**
 * Compute the `disabledModelIds` for a provider instance after model
 * discovery. Only *newly-discovered non-flagship models* are auto-disabled;
 * existing user choices are preserved.
 *
 * @param params.typeId - The provider instance type ID.
 * @param params.config - The provider instance config (used for coding-plan vendor resolution).
 * @param params.discoveredModels - The freshly discovered model list.
 * @param params.existingDisabledModelIds - The instance's current `disabledModelIds`.
 * @param params.existingDiscoveredModelIds - Set of model IDs from the *previous* discovery (for refresh).
 * @returns The new `disabledModelIds` array.
 */
export function computeDisabledModelIdsAfterDiscovery(params: {
  typeId: string;
  config: Record<string, unknown>;
  discoveredModels: DiscoveredModel[];
  existingDisabledModelIds: string[];
  existingDiscoveredModelIds: Set<string>;
}): string[] {
  const {
    typeId,
    config,
    discoveredModels,
    existingDisabledModelIds,
    existingDiscoveredModelIds,
  } = params;

  if (!isFlagshipFilteringEnabled(typeId)) {
    return existingDisabledModelIds;
  }

  // Resolve the flagship set and catalog IDs for this instance type.
  const { flagshipIds, catalogIds } = resolveFlagshipSet(typeId, config);

  // Build the set of currently-discovered model IDs (lowercase).
  const currentDiscoveredIds = new Set(
    discoveredModels.map((m) => m.modelId.toLowerCase()),
  );

  const normalizedExistingDiscoveredIds = new Set(
    Array.from(existingDiscoveredModelIds, (id) => id.toLowerCase()),
  );

  // Start with a copy of existing disabled IDs.
  const disabledSet = new Set(existingDisabledModelIds);

  // Auto-disable newly-discovered non-flagship models.
  for (const dm of discoveredModels) {
    const idLower = dm.modelId.toLowerCase();

    // Catalog models are always flagship — skip.
    if (catalogIds.has(idLower)) continue;

    // Previously known model — preserve user's choice (whether enabled or disabled).
    if (normalizedExistingDiscoveredIds.has(idLower)) continue;

    // Flagship discovered model — auto-enabled.
    if (flagshipIds.has(idLower)) continue;

    // New non-flagship discovered model — auto-disable.
    disabledSet.add(dm.modelId);
  }

  // Clean up: remove disabled IDs for models that are no longer discovered
  // AND were not catalog models (to avoid stale entries cluttering the list).
  // Catalog model IDs are never cleaned up here — user-disabled catalog
  // models should remain disabled even if they temporarily disappear from
  // discovery (which shouldn't happen for vendor APIs, but be safe).
  const finalDisabled: string[] = [];
  for (const id of Array.from(disabledSet)) {
    const idLower = id.toLowerCase();
    if (catalogIds.has(idLower)) {
      // User-disabled catalog model — keep.
      finalDisabled.push(id);
      continue;
    }
    if (currentDiscoveredIds.has(idLower)) {
      // Still discovered — keep.
      finalDisabled.push(id);
      continue;
    }
    // No longer discovered and not a catalog model — drop.
  }

  return finalDisabled;
}

/**
 * Resolve the flagship model set and catalog model ID set for a given
 * provider instance type.
 */
function resolveFlagshipSet(
  typeId: string,
  config: Record<string, unknown>,
): { flagshipIds: Set<string>; catalogIds: Set<string> } {
  if (typeId === 'openrouter') {
    // OpenRouter: all models are discovered, no catalog overlap.
    return {
      flagshipIds: OPENROUTER_FLAGSHIP_MODELS,
      catalogIds: new Set(),
    };
  }

  // Resolve vendor: either from typeId (*-api) or from coding-plan config.
  let vendor: ModelProvider | undefined;

  if (typeId === 'coding-plan') {
    const planId = config.planId as string;
    if (isCodingPlanId(planId)) {
      vendor = CODING_PLANS[planId as CodingPlanId]?.provider;
    }
  } else if (typeId.endsWith('-api')) {
    vendor = typeId.slice(0, -4) as ModelProvider;
  }

  if (!vendor) {
    return { flagshipIds: new Set(), catalogIds: new Set() };
  }

  const catalogIds = CATALOG_MODEL_IDS_BY_VENDOR[vendor] ?? new Set();
  const discoveredFlagshipIds =
    VENDOR_FLAGSHIP_DISCOVERED_MODELS[vendor] ?? new Set();

  // The effective flagship set is the union of catalog IDs + discovered-only
  // flagship IDs. But we only need the discovered-only set here, since
  // catalog models are handled separately (catalogIds check runs first).
  return {
    flagshipIds: discoveredFlagshipIds,
    catalogIds,
  };
}
