/**
 * Helpers for resolving vendor ↔ provider instance relationships in the UI.
 *
 * PR 1 uses a hybrid approach: `providerConfigs[vendor].mode` remains the
 * source of truth for which MODE a vendor is in (stagewise / official /
 * custom), because the new `providerInstances` array does not yet store a
 * vendor→custom-instance link. Credentials, however, live on provider
 * instances and are accessed via the instance procedures.
 */

import type {
  ApiSpec,
  CustomEndpoint,
  DiscoveredModel,
  ModelProvider,
  ModelThinkingOverride,
  ProviderEndpointMode,
  ProviderInstance,
  ProviderInstanceTypeId,
  UserPreferences,
} from './karton-contracts/ui/shared-types';
import {
  PROVIDER_TYPE_DISPLAY_INFO,
  type CredentialType,
} from './karton-contracts/ui/shared-types';
import { CODING_PLANS, type CodingPlanId } from './coding-plans';
import { getSemanticProviderForApiSpec } from './api-spec-provider';
import {
  availableModels,
  availableModelAliases,
  getAvailableModel,
  type BuiltInModel,
} from './available-models';
import type { ThinkingRoute } from './model-thinking-capabilities';

/**
 * Get display info for a vendor by looking up its `-api` provider type.
 * This is the UI-facing replacement for the removed PROVIDER_DISPLAY_INFO
 * vendor-keyed constant.
 */
export function getVendorDisplayInfo(vendor: ModelProvider): {
  displayName: string;
  description: string;
  helpText?: string;
  getApiKeyUrl?: string;
  defaultBaseUrl?: string;
  credentialType: CredentialType;
} {
  const typeId = `${vendor}-api` as ProviderInstanceTypeId;
  return PROVIDER_TYPE_DISPLAY_INFO[typeId];
}

/**
 * Get the default base URL for a vendor's official API.
 * Replacement for the removed PROVIDER_OFFICIAL_URLS vendor-keyed constant.
 */
export function getVendorOfficialUrl(vendor: ModelProvider): string {
  return getVendorDisplayInfo(vendor)?.defaultBaseUrl ?? '';
}

/**
 * Get display info for a provider instance type by its typeId.
 */
export function getTypeDisplayInfo(typeId: ProviderInstanceTypeId): {
  displayName: string;
  description: string;
  helpText?: string;
  getApiKeyUrl?: string;
  defaultBaseUrl?: string;
  credentialType: CredentialType;
} {
  return PROVIDER_TYPE_DISPLAY_INFO[typeId];
}

/** Maps a provider instance `typeId` back to the legacy `ApiSpec`. */
export const INSTANCE_TYPE_ID_TO_API_SPEC: Record<string, ApiSpec> = {
  'custom-anthropic': 'anthropic',
  'custom-openai-chat': 'openai-chat-completions',
  'custom-openai-responses': 'openai-responses',
  'custom-google': 'google',
  azure: 'azure',
  bedrock: 'amazon-bedrock',
  vertex: 'google-vertex',
};

/** Derive the `ApiSpec` for a custom-type provider instance. */
export function instanceTypeIdToApiSpec(typeId: string): ApiSpec | undefined {
  return INSTANCE_TYPE_ID_TO_API_SPEC[typeId];
}

/** Maps a legacy `ApiSpec` to the new provider instance `typeId`. */
const API_SPEC_TO_TYPE_ID: Record<ApiSpec, ProviderInstance['typeId']> = {
  anthropic: 'custom-anthropic',
  'openai-chat-completions': 'custom-openai-chat',
  'openai-responses': 'custom-openai-responses',
  google: 'custom-google',
  azure: 'azure',
  'amazon-bedrock': 'bedrock',
  'google-vertex': 'vertex',
};

/** Convert an `ApiSpec` to the corresponding provider instance `typeId`. */
export function apiSpecToTypeId(apiSpec: ApiSpec): ProviderInstance['typeId'] {
  return API_SPEC_TO_TYPE_ID[apiSpec];
}

/**
 * Build a `CustomEndpoint`-shaped view from a custom-type provider
 * instance. This lets the existing form/card components (which read
 * `CustomEndpoint` fields) work with provider instances without
 * internal changes — a mechanical data-source swap for PR 1.
 */
export function providerInstanceToCustomEndpoint(
  instance: ProviderInstance,
): CustomEndpoint {
  const apiSpec = INSTANCE_TYPE_ID_TO_API_SPEC[instance.typeId];
  if (!apiSpec) {
    throw new Error(
      `providerInstanceToCustomEndpoint: typeId ${instance.typeId} is not a custom-endpoint type`,
    );
  }
  switch (instance.typeId) {
    case 'custom-anthropic':
    case 'custom-openai-chat':
    case 'custom-openai-responses':
    case 'custom-google':
      return {
        id: instance.id,
        name: instance.name,
        apiSpec,
        baseUrl: instance.config.baseUrl,
        encryptedApiKey: instance.config.encryptedApiKey,
        modelIdMapping: instance.config.modelIdMapping,
        resourceName: undefined,
        apiVersion: undefined,
        region: undefined,
        encryptedSecretKey: undefined,
        awsAuthMode: 'access-keys',
        awsProfileName: undefined,
        projectId: undefined,
        location: undefined,
        encryptedGoogleCredentials: undefined,
      };
    case 'azure':
      return {
        id: instance.id,
        name: instance.name,
        apiSpec,
        baseUrl: instance.config.baseUrl,
        encryptedApiKey: instance.config.encryptedApiKey,
        modelIdMapping: instance.config.modelIdMapping,
        resourceName: instance.config.resourceName,
        apiVersion: instance.config.apiVersion,
        region: undefined,
        encryptedSecretKey: undefined,
        awsAuthMode: 'access-keys',
        awsProfileName: undefined,
        projectId: undefined,
        location: undefined,
        encryptedGoogleCredentials: undefined,
      };
    case 'bedrock':
      return {
        id: instance.id,
        name: instance.name,
        apiSpec,
        baseUrl: '',
        encryptedApiKey: instance.config.encryptedApiKey,
        modelIdMapping: instance.config.modelIdMapping,
        resourceName: undefined,
        apiVersion: undefined,
        region: instance.config.region,
        encryptedSecretKey: instance.config.encryptedSecretKey,
        awsAuthMode: instance.config.awsAuthMode,
        awsProfileName: instance.config.awsProfileName,
        projectId: undefined,
        location: undefined,
        encryptedGoogleCredentials: undefined,
      };
    case 'vertex':
      return {
        id: instance.id,
        name: instance.name,
        apiSpec,
        baseUrl: '',
        encryptedApiKey: undefined,
        modelIdMapping: instance.config.modelIdMapping,
        resourceName: undefined,
        apiVersion: undefined,
        region: undefined,
        encryptedSecretKey: undefined,
        awsAuthMode: 'access-keys',
        awsProfileName: undefined,
        projectId: instance.config.projectId,
        location: instance.config.location,
        encryptedGoogleCredentials: instance.config.encryptedGoogleCredentials,
      };
    default:
      throw new Error(
        `providerInstanceToCustomEndpoint: unsupported typeId ${instance.typeId}`,
      );
  }
}

/**
 * Resolve the provider instance that serves a given vendor.
 *
 * Mirrors backend routing: the legacy custom-provider link remains explicit,
 * while concrete coding-plan and vendor API instances take precedence over a
 * stale legacy `stagewise` mode.
 */
export function findInstanceForVendor(
  preferences: UserPreferences,
  vendor: ModelProvider,
): ProviderInstance | undefined {
  const instances = preferences.providerInstances ?? [];
  const legacyConfig = preferences.providerConfigs?.[vendor];

  // Custom-mode routing remains an explicit legacy link during the transition.
  if (legacyConfig?.mode === 'custom') {
    if (!legacyConfig.customProviderId) return undefined;
    return instances.find(
      (instance) => instance.id === legacyConfig.customProviderId,
    );
  }

  return findVendorApiInstance(instances, vendor);
}

/**
 * Resolve a vendor's concrete instance. Coding plans win over general vendor
 * API instances regardless of their position in the instance list.
 */
function findVendorApiInstance(
  instances: ProviderInstance[],
  vendor: ModelProvider,
): ProviderInstance | undefined {
  const codingPlanInstance = instances.find((instance) => {
    if (instance.typeId !== 'coding-plan') return false;
    const plan = CODING_PLANS[instance.config.planId as CodingPlanId];
    return plan?.provider === vendor;
  });
  if (codingPlanInstance) return codingPlanInstance;

  return instances.find(
    (instance) =>
      instance.typeId !== 'stagewise' &&
      instance.typeId.endsWith('-api') &&
      instance.typeId.slice(0, -4) === vendor,
  );
}

/**
 * Derive the effective endpoint mode for a vendor from its serving instance.
 * A legacy official mode remains visible before an instance is created, but a
 * stale legacy stagewise mode cannot mask a concrete route.
 */
export function getVendorMode(
  preferences: UserPreferences,
  vendor: ModelProvider,
): ProviderEndpointMode {
  const legacyConfig = preferences.providerConfigs?.[vendor];
  const instance = findInstanceForVendor(preferences, vendor);

  if (legacyConfig?.mode === 'custom') {
    return instance ? 'custom' : 'stagewise';
  }
  if (instance) return 'official';
  return legacyConfig?.mode === 'official' ? 'official' : 'stagewise';
}

/**
 * Check whether a vendor has an encrypted API key on its serving instance.
 */
export function vendorHasApiKey(
  preferences: UserPreferences,
  vendor: ModelProvider,
): boolean {
  const instance = findInstanceForVendor(preferences, vendor);
  if (!instance || instance.typeId === 'stagewise') return false;
  return !!(instance.config as { encryptedApiKey?: string }).encryptedApiKey;
}

/**
 * Get the instance ID for a vendor, or `undefined` if it falls back to
 * stagewise (no vendor-specific instance).
 */
export function getVendorInstanceId(
  preferences: UserPreferences,
  vendor: ModelProvider,
): string | undefined {
  const instance = findInstanceForVendor(preferences, vendor);
  if (!instance || instance.typeId === 'stagewise') return undefined;
  return instance.id;
}

/**
 * Resolve a custom model's provider instance by its `providerInstanceId`.
 * Falls back to `endpointId` for legacy data that hasn't been migrated yet.
 */
export function resolveCustomModelInstance(
  preferences: UserPreferences,
  model: { providerInstanceId?: string; endpointId?: string },
): ProviderInstance | undefined {
  const instances = preferences.providerInstances ?? [];
  const id = model.providerInstanceId ?? model.endpointId;
  if (!id) return undefined;
  return instances.find((i) => i.id === id);
}

/**
 * Resolve the display name for a custom model's provider instance.
 */
export function resolveCustomModelInstanceName(
  preferences: UserPreferences,
  model: { providerInstanceId?: string; endpointId?: string },
): string {
  const instance = resolveCustomModelInstance(preferences, model);
  return instance?.name ?? 'Unknown';
}

/**
 * Filter provider instances to only custom-type instances
 * (custom-*, azure, bedrock, vertex) — the ones that appear in the
 * custom provider selector.
 */
export function getCustomTypeInstances(
  preferences: UserPreferences,
): ProviderInstance[] {
  const instances = preferences.providerInstances ?? [];
  return instances.filter((i) => i.typeId in INSTANCE_TYPE_ID_TO_API_SPEC);
}

/**
 * Filter provider instances to only vendor-api instances
 * (anthropic-api, openai-api, etc.).
 */
export function getVendorApiInstances(
  preferences: UserPreferences,
): ProviderInstance[] {
  const instances = preferences.providerInstances ?? [];
  return instances.filter((i) => i.typeId.endsWith('-api'));
}

/**
 * Filter provider instances to only coding-plan instances.
 */
export function getCodingPlanInstances(
  preferences: UserPreferences,
): ProviderInstance[] {
  const instances = preferences.providerInstances ?? [];
  return instances.filter((i) => i.typeId === 'coding-plan');
}

/**
 * Find the coding-plan instance for a specific plan ID.
 */
export function findCodingPlanInstance(
  preferences: UserPreferences,
  planId: CodingPlanId,
): ProviderInstance | undefined {
  return getCodingPlanInstances(preferences).find(
    (i) => (i.config as { planId: string }).planId === planId,
  );
}

/**
 * The default stagewise instance ID. Vendors not assigned to a
 * specific instance fall back to this one at routing time.
 */
export const DEFAULT_INSTANCE_ID = 'stagewise-default';

/**
 * Resolve thinking default options for a specific provider instance.
 * This replaces the vendor-based `getThinkingDefaultOptionsForModel`
 * with instance-aware resolution: given the instance serving a model,
 * determine whether thinking defaults come from stagewise, official API,
 * or a custom endpoint.
 */
export function getInstanceThinkingDefaultOptions(
  instance: ProviderInstance,
): ThinkingRoute {
  if (instance.typeId === 'stagewise') {
    return { providerMode: 'stagewise' };
  }
  if (instance.typeId === 'openrouter' || instance.typeId === 'ollama') {
    // OpenRouter and Ollama use the OpenAI Chat Completions protocol, even
    // though their discovered model IDs are not owned by one catalog vendor.
    return {
      providerMode: 'official',
      modelProvider: 'openai',
      thinkingProvider: 'openai-compatible',
    };
  }
  if (instance.typeId === 'coding-plan' || instance.typeId.endsWith('-api')) {
    return {
      providerMode: 'official',
      modelProvider: getVendorForInstance(instance),
    };
  }
  // Custom-type instance (custom-*, azure, bedrock, vertex).
  const apiSpec = instanceTypeIdToApiSpec(instance.typeId);
  if (apiSpec) {
    return {
      providerMode: 'custom',
      modelProvider: getSemanticProviderForApiSpec(apiSpec),
      customEndpointApiSpec: apiSpec,
    };
  }
  return { providerMode: 'stagewise' };
}

/**
 * Get the `disabledModelIds` for a specific provider instance.
 * Returns an empty array if the instance is not found.
 */
export function getInstanceDisabledModelIds(
  preferences: UserPreferences,
  instanceId: string,
): string[] {
  const instances = preferences.providerInstances ?? [];
  const instance = instances.find((i) => i.id === instanceId);
  return instance?.disabledModelIds ?? [];
}

/**
 * Get the `disabledModelIds` for the default stagewise instance.
 * Used by the model selector and settings as the interim source of
 * truth until the full per-instance selector rewrite (PR 3 Phase 3).
 */
export function getDefaultInstanceDisabledModelIds(
  preferences: UserPreferences,
): string[] {
  return getInstanceDisabledModelIds(preferences, DEFAULT_INSTANCE_ID);
}

/**
 * Toggle a model's disabled state on a specific provider instance.
 * Returns the updated `disabledModelIds` array for that instance.
 */
export function toggleInstanceDisabledModelId(
  preferences: UserPreferences,
  instanceId: string,
  modelId: string,
): string[] {
  const current = getInstanceDisabledModelIds(preferences, instanceId);
  const idx = current.indexOf(modelId);
  if (idx === -1) {
    return [...current, modelId];
  }
  return current.filter((id) => id !== modelId);
}

/**
 * Resolve the thinking overrides for a specific provider instance + model.
 * Returns `undefined` if no override is set.
 */
export function getInstanceModelThinkingOverride(
  preferences: UserPreferences,
  instanceId: string,
  modelId: string,
): ModelThinkingOverride | undefined {
  const overrides =
    preferences.agent.modelThinkingOverrides?.[instanceId] ?? {};
  return overrides[modelId];
}

// ===========================================================================
// Model Selector Aggregation
// ===========================================================================

/**
 * A single selectable entry in the model selector, representing a
 * `(instanceId, modelId)` pair. The selector groups these by instance.
 */
export interface ModelSelectorEntry {
  instanceId: string;
  instanceName: string;
  typeId: ProviderInstanceTypeId;
  modelId: string;
  displayName: string;
  description: string;
  /** Display label, e.g. "1M context". */
  contextLabel: string;
  /** Raw context window size in tokens (for the footer token bar). */
  contextWindowRaw: number;
  thinkingEnabled: boolean;
  pricingMultiplier?: number;
  isAlias: boolean;
  /** The catalog model, if this entry is a built-in model or alias. */
  catalogModel?: BuiltInModel;
  /** The concrete model ID that this entry routes to. */
  targetModelId: string;
}

/**
 * Determine which vendor a provider instance type serves.
 * Returns `undefined` for stagewise (serves all), custom/cloud types
 * (serve only custom models), and coding plans (resolved separately).
 */
function getVendorForTypeId(
  typeId: ProviderInstanceTypeId,
): ModelProvider | undefined {
  if (typeId.endsWith('-api')) {
    return typeId.slice(0, -4) as ModelProvider;
  }
  return undefined;
}

/**
 * Normalize model IDs for catalog/discovery matching without changing the ID
 * displayed or sent to the provider. Anthropic's catalog uses dotted version
 * numbers, while its native discovery API returns the equivalent hyphenated ID.
 */
function getCatalogMatchId(
  instance: ProviderInstance,
  modelId: string,
): string {
  const vendor = getVendorForInstance(instance);
  return vendor === 'anthropic'
    ? modelId.replace(/\./g, '-').toLowerCase()
    : modelId.toLowerCase();
}

/**
 * Resolve the vendor for any provider instance, including coding plans.
 * Returns `undefined` for stagewise, custom/cloud, and self-hosted types.
 */
export function getVendorForInstance(
  instance: ProviderInstance,
): ModelProvider | undefined {
  if (instance.typeId.endsWith('-api')) {
    return instance.typeId.slice(0, -4) as ModelProvider;
  }
  if (instance.typeId === 'coding-plan') {
    const planId = (instance.config as { planId: string })
      .planId as CodingPlanId;
    return CODING_PLANS[planId]?.provider;
  }
  return undefined;
}

/**
 * Build a `ModelSelectorEntry` from a built-in catalog model.
 */
function makeBuiltInEntry(
  instance: ProviderInstance,
  modelId: string,
  displayName: string,
  description: string,
  catalogModel: BuiltInModel,
  isAlias: boolean,
  targetModelId: string,
): ModelSelectorEntry {
  return {
    instanceId: instance.id,
    instanceName: instance.name,
    typeId: instance.typeId,
    modelId,
    displayName,
    description,
    contextLabel: catalogModel.modelContext,
    contextWindowRaw: catalogModel.modelContextRaw,
    thinkingEnabled: catalogModel.thinkingEnabled,
    pricingMultiplier: catalogModel.pricing?.relativeMultiplier,
    isAlias,
    catalogModel,
    targetModelId,
  };
}

/**
 * Build a `ModelSelectorEntry` from a custom model.
 */
function makeCustomEntry(
  instance: ProviderInstance,
  model: {
    modelId: string;
    displayName: string;
    description: string;
    contextWindowSize: number;
    thinkingEnabled: boolean;
  },
): ModelSelectorEntry {
  return {
    instanceId: instance.id,
    instanceName: instance.name,
    typeId: instance.typeId,
    modelId: model.modelId,
    displayName: model.displayName,
    description: model.description,
    contextLabel: `${Math.round(model.contextWindowSize / 1000)}k context`,
    contextWindowRaw: model.contextWindowSize,
    thinkingEnabled: !!model.thinkingEnabled,
    isAlias: false,
    targetModelId: model.modelId,
  };
}

/**
 * Build a `ModelSelectorEntry` from a discovered model (self-hosted providers).
 */
function makeDiscoveredEntry(
  instance: ProviderInstance,
  model: DiscoveredModel,
): ModelSelectorEntry {
  // Discovered models rarely report context windows. Default to 128k —
  // a realistic floor for modern cloud models in an agentic IDE.
  const contextWindow = model.contextWindow ?? 128_000;
  return {
    instanceId: instance.id,
    instanceName: instance.name,
    typeId: instance.typeId,
    modelId: model.modelId,
    displayName: model.displayName,
    description: model.description ?? '',
    contextLabel: `${Math.round(contextWindow / 1000)}k context`,
    contextWindowRaw: contextWindow,
    thinkingEnabled: !!model.thinkingEnabled,
    isAlias: false,
    targetModelId: model.modelId,
  };
}

/**
 * Produce the flat list of `(instanceId, modelId)` pairs for the model
 * selector. Each entry represents one model as served by one provider
 * instance.
 *
 * - **stagewise** instance: all catalog models (aliases + concrete),
 *   non-duplicate discovered models, and matching custom models.
 * - **vendor-api** instances (e.g. `anthropic-api`): that vendor's catalog
 *   models, non-duplicate discovered models, and matching custom models.
 * - **coding-plan** instances: the plan vendor's catalog models,
 *   non-duplicate discovered models, and matching custom models.
 * - **self-hosted** types (e.g. ollama): discovered models filtered by
 *   `enabledModelIds` + matching custom models.
 * - **custom/cloud** types (custom-*, azure, bedrock, vertex): only
 *   matching custom models.
 *
 * Models in an instance's `disabledModelIds` are excluded.
 */
export function getSelectableModelEntries(
  prefs: Pick<UserPreferences, 'providerInstances' | 'customModels'>,
  options?: { includeDisabled?: boolean },
): ModelSelectorEntry[] {
  const includeDisabled = options?.includeDisabled ?? false;
  const instances = prefs.providerInstances ?? [];
  const customModels = prefs.customModels ?? [];
  const entries: ModelSelectorEntry[] = [];

  for (const instance of instances) {
    const disabled = new Set(instance.disabledModelIds ?? []);
    const isDisabled = (id: string) => !includeDisabled && disabled.has(id);
    // Track catalog model IDs pushed for this instance so discovered
    // models that duplicate a catalog entry are skipped (catalog wins).
    // Stored lowercase for case-insensitive matching — some APIs return
    // native casing (e.g. MiniMax `MiniMax-M3`) while the catalog uses
    // lowercase (`minimax-m3`).
    const catalogModelIds = new Set<string>();
    const instanceCustomModels = customModels.filter(
      (model) =>
        (model.providerInstanceId ?? model.endpointId) === instance.id &&
        !isDisabled(model.modelId),
    );
    const customModelIds = new Set(
      instanceCustomModels.map((model) =>
        getCatalogMatchId(instance, model.modelId),
      ),
    );

    // --- Catalog models for this instance ---

    if (instance.typeId === 'stagewise') {
      // Aliases (stagewise-curated recommendations)
      for (const alias of availableModelAliases) {
        if (isDisabled(alias.modelId)) continue;
        const targetModel = getAvailableModel(alias.targetModelId);
        if (!targetModel) continue;
        entries.push(
          makeBuiltInEntry(
            instance,
            alias.modelId,
            alias.modelDisplayName,
            alias.modelDescription,
            targetModel,
            true,
            alias.targetModelId,
          ),
        );
        catalogModelIds.add(getCatalogMatchId(instance, alias.modelId));
      }
      // All concrete catalog models
      for (const model of availableModels) {
        if (isDisabled(model.modelId)) continue;
        entries.push(
          makeBuiltInEntry(
            instance,
            model.modelId,
            model.modelDisplayName,
            model.modelDescription,
            model,
            false,
            model.modelId,
          ),
        );
        catalogModelIds.add(getCatalogMatchId(instance, model.modelId));
      }
    } else if (instance.typeId === 'coding-plan') {
      // Serve the plan vendor's catalog models
      const planId = (instance.config as { planId: string })
        .planId as CodingPlanId;
      const plan = CODING_PLANS[planId];
      if (plan) {
        for (const model of availableModels) {
          if (model.officialProvider !== plan.provider) continue;
          if (isDisabled(model.modelId)) continue;
          entries.push(
            makeBuiltInEntry(
              instance,
              model.modelId,
              model.modelDisplayName,
              model.modelDescription,
              model,
              false,
              model.modelId,
            ),
          );
          catalogModelIds.add(getCatalogMatchId(instance, model.modelId));
        }
      }
    } else {
      const vendor = getVendorForTypeId(instance.typeId);
      if (vendor) {
        // Vendor API: serve that vendor's catalog models
        for (const model of availableModels) {
          if (model.officialProvider !== vendor) continue;
          if (isDisabled(model.modelId)) continue;
          entries.push(
            makeBuiltInEntry(
              instance,
              model.modelId,
              model.modelDisplayName,
              model.modelDescription,
              model,
              false,
              model.modelId,
            ),
          );
          catalogModelIds.add(getCatalogMatchId(instance, model.modelId));
        }
      }
      // Custom/cloud instances expose catalog models explicitly configured in
      // their wire-ID mapping. Treat the mapping keys as selectable canonical
      // IDs so validation and model creation agree on these routes.
      if (!vendor) {
        const modelIdMapping = (
          instance.config as { modelIdMapping?: Record<string, string> }
        ).modelIdMapping;
        for (const modelId of Object.keys(modelIdMapping ?? {})) {
          if (isDisabled(modelId)) continue;
          const model = getAvailableModel(modelId);
          if (!model) continue;
          entries.push(
            makeBuiltInEntry(
              instance,
              model.modelId,
              model.modelDisplayName,
              model.modelDescription,
              model,
              false,
              model.modelId,
            ),
          );
          catalogModelIds.add(getCatalogMatchId(instance, model.modelId));
        }
      }
    }

    // --- Discovered models (self-hosted + vendor API discovery) ---
    // Skip models whose ID matches a catalog entry — catalog wins to
    // preserve rich metadata (pricing, thinking, input constraints).

    if (instance.discoveredModels && instance.discoveredModels.length > 0) {
      const enabled = new Set(instance.enabledModelIds ?? []);
      const hasEnabledList =
        instance.enabledModelIds && instance.enabledModelIds.length > 0;
      for (const dm of instance.discoveredModels) {
        if (
          catalogModelIds.has(getCatalogMatchId(instance, dm.modelId)) ||
          customModelIds.has(getCatalogMatchId(instance, dm.modelId))
        ) {
          continue;
        }
        if (isDisabled(dm.modelId)) continue;
        if (hasEnabledList && !enabled.has(dm.modelId)) continue;
        entries.push(makeDiscoveredEntry(instance, dm));
      }
    }

    // --- Custom models for this instance ---

    for (const cm of instanceCustomModels) {
      entries.push(makeCustomEntry(instance, cm));
    }
  }

  return entries;
}

/**
 * Find a specific `ModelSelectorEntry` by `(instanceId, modelId)`.
 * Returns `undefined` if no entry matches.
 */
export function findModelSelectorEntry(
  prefs: Pick<UserPreferences, 'providerInstances' | 'customModels'>,
  instanceId: string,
  modelId: string,
): ModelSelectorEntry | undefined {
  const entries = getSelectableModelEntries(prefs, { includeDisabled: true });
  const exactEntry = entries.find(
    (entry) => entry.instanceId === instanceId && entry.modelId === modelId,
  );
  if (exactEntry) return exactEntry;

  const instance = (prefs.providerInstances ?? []).find(
    (candidate) => candidate.id === instanceId,
  );
  if (!instance) return undefined;

  const canonicalModelId = getCatalogMatchId(instance, modelId);
  return entries.find(
    (entry) =>
      entry.instanceId === instanceId &&
      getCatalogMatchId(instance, entry.modelId) === canonicalModelId,
  );
}

/**
 * Count the enabled models for a single provider instance.
 * Excludes disabled models and respects the instance type's model set.
 */
export function getInstanceModelCount(
  instance: ProviderInstance,
  preferences?: Pick<UserPreferences, 'customModels'>,
): number {
  const disabled = new Set(instance.disabledModelIds ?? []);
  let count = 0;
  // Track catalog model IDs counted for this instance so discovered
  // models that duplicate a catalog entry are not double-counted.
  // Stored lowercase for case-insensitive matching.
  const catalogModelIds = new Set<string>();

  if (instance.typeId === 'stagewise') {
    count += availableModelAliases.filter(
      (a) => !disabled.has(a.modelId),
    ).length;
    for (const a of availableModelAliases) {
      if (!disabled.has(a.modelId))
        catalogModelIds.add(getCatalogMatchId(instance, a.modelId));
    }
    count += availableModels.filter((m) => !disabled.has(m.modelId)).length;
    for (const m of availableModels) {
      if (!disabled.has(m.modelId))
        catalogModelIds.add(getCatalogMatchId(instance, m.modelId));
    }
  } else if (instance.typeId === 'coding-plan') {
    const planId = (instance.config as { planId: string })
      .planId as CodingPlanId;
    const plan = CODING_PLANS[planId];
    if (plan) {
      const vendorModels = availableModels.filter(
        (m) => m.officialProvider === plan.provider && !disabled.has(m.modelId),
      );
      count += vendorModels.length;
      for (const m of vendorModels)
        catalogModelIds.add(getCatalogMatchId(instance, m.modelId));
    }
  } else {
    const vendor = getVendorForTypeId(instance.typeId);
    if (vendor) {
      const vendorModels = availableModels.filter(
        (m) => m.officialProvider === vendor && !disabled.has(m.modelId),
      );
      count += vendorModels.length;
      for (const m of vendorModels)
        catalogModelIds.add(getCatalogMatchId(instance, m.modelId));
    }
  }

  const customModelIds = new Set(
    (preferences?.customModels ?? [])
      .filter(
        (model) =>
          (model.providerInstanceId ?? model.endpointId) === instance.id,
      )
      .map((model) => getCatalogMatchId(instance, model.modelId)),
  );

  // Discovered models (self-hosted + vendor API discovery). This runs for
  // every instance type because coding plans and stagewise may also discover
  // vendor models beyond their catalog entries.
  if (instance.discoveredModels && instance.discoveredModels.length > 0) {
    const enabled = new Set(instance.enabledModelIds ?? []);
    const hasEnabledList =
      instance.enabledModelIds && instance.enabledModelIds.length > 0;
    for (const dm of instance.discoveredModels) {
      const normalizedModelId = getCatalogMatchId(instance, dm.modelId);
      if (
        catalogModelIds.has(normalizedModelId) ||
        customModelIds.has(normalizedModelId)
      ) {
        continue;
      }
      if (disabled.has(dm.modelId)) continue;
      if (hasEnabledList && !enabled.has(dm.modelId)) continue;
      count++;
    }
  }

  if (preferences) {
    count += (preferences.customModels ?? []).filter((model) => {
      const instanceId = model.providerInstanceId ?? model.endpointId;
      return instanceId === instance.id && !disabled.has(model.modelId);
    }).length;
  }

  return count;
}

// ===========================================================================
// Model Validity Checking (for utility models & presets)
// ===========================================================================

/**
 * Check whether a `(modelId, providerInstanceId?)` pair is currently
 * selectable — i.e. the provider instance exists and the model is not
 * disabled. Used by the settings UI to mark invalid entries in utility
 * model lists and presets.
 *
 * When `providerInstanceId` is omitted, checks whether the model is
 * selectable on *any* instance.
 */
export function isModelEntryValid(
  prefs: Pick<UserPreferences, 'providerInstances' | 'customModels'>,
  modelId: string,
  providerInstanceId?: string,
): boolean {
  const entries = getSelectableModelEntries(prefs);
  if (providerInstanceId) {
    return entries.some(
      (e) => e.instanceId === providerInstanceId && e.modelId === modelId,
    );
  }
  return entries.some((e) => e.modelId === modelId);
}
