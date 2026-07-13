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
import {
  availableModels,
  availableModelAliases,
  getAvailableModel,
  type BuiltInModel,
} from './available-models';

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
 * Uses the same logic as the routing layer's `findInstanceForVendor`, but
 * also checks the legacy `providerConfigs` custom-mode link so that
 * custom-mode vendors resolve correctly during the PR 1 transition.
 */
export function findInstanceForVendor(
  preferences: UserPreferences,
  vendor: ModelProvider,
): ProviderInstance | undefined {
  const instances = preferences.providerInstances ?? [];
  const legacyConfig = preferences.providerConfigs?.[vendor];

  // The legacy `mode` is the source of truth for the user's routing intent.
  // When it is set we resolve strictly by it — no stagewise fallback — so
  // that an 'official' vendor without a created instance yet returns
  // undefined (not the shared stagewise instance), which lets the UI
  // distinguish "no key configured" from "using stagewise".
  if (legacyConfig) {
    switch (legacyConfig.mode) {
      case 'stagewise':
        return undefined;
      case 'custom':
        if (!legacyConfig.customProviderId) return undefined;
        return instances.find((i) => i.id === legacyConfig.customProviderId);
      case 'official':
        return findVendorApiInstance(instances, vendor);
    }
  }

  // No legacy config — derive from instances, falling back to stagewise.
  return (
    findVendorApiInstance(instances, vendor) ??
    instances.find((i) => i.typeId === 'stagewise')
  );
}

/**
 * Scan instances for a vendor-specific `-api` or `coding-plan` instance.
 * Returns undefined if none matches.
 */
function findVendorApiInstance(
  instances: ProviderInstance[],
  vendor: ModelProvider,
): ProviderInstance | undefined {
  for (const instance of instances) {
    if (instance.typeId === 'stagewise') continue;
    if (instance.typeId.endsWith('-api')) {
      if (instance.typeId.slice(0, -4) === vendor) return instance;
      continue;
    }
    if (instance.typeId === 'coding-plan') {
      const plan = CODING_PLANS[instance.config.planId as CodingPlanId];
      if (plan?.provider === vendor) return instance;
      continue;
    }
  }
  return undefined;
}

/**
 * Derive the effective endpoint mode for a vendor from its provider instance.
 * Falls back to `providerConfigs[vendor].mode` for custom-mode vendors
 * whose instance link is only stored in the legacy config.
 */
export function getVendorMode(
  preferences: UserPreferences,
  vendor: ModelProvider,
): ProviderEndpointMode {
  // The legacy `mode` is the source of truth for routing intent. Respect it
  // directly — an 'official' mode must surface as 'official' even before a
  // vendor-api instance has been created (the instance is only created after
  // the user enters and validates a key).
  const legacyConfig = preferences.providerConfigs?.[vendor];
  if (legacyConfig) return legacyConfig.mode;

  // No legacy config — derive from instances.
  const instance = findInstanceForVendor(preferences, vendor);
  if (!instance || instance.typeId === 'stagewise') return 'stagewise';
  return 'official';
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
export function getInstanceThinkingDefaultOptions(instance: ProviderInstance): {
  providerMode: ProviderEndpointMode;
  customEndpointApiSpec?: ApiSpec;
} {
  if (instance.typeId === 'stagewise') {
    return { providerMode: 'stagewise' };
  }
  if (instance.typeId === 'coding-plan') {
    // Coding plans route through the plan vendor's official API.
    return { providerMode: 'official' };
  }
  if (instance.typeId.endsWith('-api') || instance.typeId === 'openrouter') {
    return { providerMode: 'official' };
  }
  // Custom-type instance (custom-*, azure, bedrock, vertex).
  const apiSpec = instanceTypeIdToApiSpec(instance.typeId);
  if (apiSpec) {
    return { providerMode: 'custom', customEndpointApiSpec: apiSpec };
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
 * - **stagewise** instance: all catalog models (aliases + concrete) +
 *   custom models whose `providerInstanceId` matches.
 * - **vendor-api** instances (e.g. `anthropic-api`): that vendor's
 *   catalog models + matching custom models.
 * - **coding-plan** instances: the plan's vendor's catalog models +
 *   matching custom models.
 * - **self-hosted** types (e.g. ollama): discovered models filtered by
 *   `enabledModelIds` + matching custom models.
 * - **custom/cloud** types (custom-*, azure, bedrock, vertex): only
 *   matching custom models.
 *
 * Models in an instance's `disabledModelIds` are excluded.
 */
export function getSelectableModelEntries(
  prefs: UserPreferences,
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
        catalogModelIds.add(alias.modelId.toLowerCase());
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
        catalogModelIds.add(model.modelId.toLowerCase());
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
          catalogModelIds.add(model.modelId.toLowerCase());
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
          catalogModelIds.add(model.modelId.toLowerCase());
        }
      }
      // Custom/cloud types (no vendor): only custom models below
    }

    // --- Discovered models (self-hosted + vendor API discovery) ---
    // Skip models whose ID matches a catalog entry — catalog wins to
    // preserve rich metadata (pricing, thinking, input constraints).

    if (instance.discoveredModels && instance.discoveredModels.length > 0) {
      const enabled = new Set(instance.enabledModelIds ?? []);
      const hasEnabledList =
        instance.enabledModelIds && instance.enabledModelIds.length > 0;
      for (const dm of instance.discoveredModels) {
        if (catalogModelIds.has(dm.modelId.toLowerCase())) continue;
        if (isDisabled(dm.modelId)) continue;
        if (hasEnabledList && !enabled.has(dm.modelId)) continue;
        entries.push(makeDiscoveredEntry(instance, dm));
      }
    }

    // --- Custom models for this instance ---

    for (const cm of customModels) {
      const assignedInstanceId = cm.providerInstanceId ?? cm.endpointId;
      if (assignedInstanceId !== instance.id) continue;
      if (isDisabled(cm.modelId)) continue;
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
  prefs: UserPreferences,
  instanceId: string,
  modelId: string,
): ModelSelectorEntry | undefined {
  return getSelectableModelEntries(prefs).find(
    (e) => e.instanceId === instanceId && e.modelId === modelId,
  );
}

/**
 * Count the enabled models for a single provider instance.
 * Excludes disabled models and respects the instance type's model set.
 */
export function getInstanceModelCount(instance: ProviderInstance): number {
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
        catalogModelIds.add(a.modelId.toLowerCase());
    }
    count += availableModels.filter((m) => !disabled.has(m.modelId)).length;
    for (const m of availableModels) {
      if (!disabled.has(m.modelId))
        catalogModelIds.add(m.modelId.toLowerCase());
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
        catalogModelIds.add(m.modelId.toLowerCase());
    }
  } else {
    const vendor = getVendorForTypeId(instance.typeId);
    if (vendor) {
      const vendorModels = availableModels.filter(
        (m) => m.officialProvider === vendor && !disabled.has(m.modelId),
      );
      count += vendorModels.length;
      for (const m of vendorModels)
        catalogModelIds.add(m.modelId.toLowerCase());
    }

    // Discovered models (self-hosted + vendor API discovery)
    if (instance.discoveredModels && instance.discoveredModels.length > 0) {
      const enabled = new Set(instance.enabledModelIds ?? []);
      const hasEnabledList =
        instance.enabledModelIds && instance.enabledModelIds.length > 0;
      for (const dm of instance.discoveredModels) {
        if (catalogModelIds.has(dm.modelId.toLowerCase())) continue;
        if (disabled.has(dm.modelId)) continue;
        if (hasEnabledList && !enabled.has(dm.modelId)) continue;
        count++;
      }
    }
  }

  return count;
}
