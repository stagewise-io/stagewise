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
  ModelProvider,
  ProviderEndpointMode,
  ProviderInstance,
  UserPreferences,
} from './karton-contracts/ui/shared-types';
import { CODING_PLANS, type CodingPlanId } from './coding-plans';

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
  return instances.filter((i) => {
    if (i.typeId === 'stagewise') return false;
    if (i.typeId === 'coding-plan') return false;
    if (i.typeId.endsWith('-api')) return false;
    return true;
  });
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
