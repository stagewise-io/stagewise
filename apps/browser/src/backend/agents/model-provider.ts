import type { TelemetryService } from '@/services/telemetry';
import type { ModelAlias, ModelId } from '@shared/available-models';
import type {
  ModelProvider,
  ApiSpec,
  CustomModel,
  DiscoveredModel,
  ModelThinkingOverride,
  ProviderInstance,
} from '@shared/karton-contracts/ui/shared-types';
import type { ReasoningSignatureSource } from '@shared/karton-contracts/ui/agent/metadata';
import {
  createReasoningSignatureSource,
  type ProviderMode,
} from './reasoning-signatures';
import { getSemanticProviderForApiSpec } from '@shared/api-spec-provider';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import {
  type availableModels,
  getAvailableModel,
  getModelAlias,
} from '@shared/available-models';
import { CODING_PLANS } from '@shared/coding-plans';
import type { AuthService } from '@/services/auth';
import type { PreferencesService } from '@/services/preferences';
import type { streamText } from 'ai';
import { wrapLanguageModel } from 'ai';
import {
  MODEL_REQUEST_PURPOSE_METADATA_KEY,
  PROVIDER_INSTANCE_ID_METADATA_KEY,
} from '@stagewise/agent-core/host';
import {
  findInstanceForVendor,
  findModelSelectorEntry,
} from '@shared/provider-instance-helpers';
import {
  createThinkingProviderOptionsPatch,
  getDefaultThinkingSelection,
  getThinkingProviderForRoute,
  type ThinkingCapableModel,
  type ThinkingProvider,
} from '@shared/model-thinking-capabilities';

// ── Provider type registry ──────────────────────────────────────────────────
import type { ProviderType } from './providers/types';
import { getProviderType, getProviderTypeByVendor } from './providers/registry';
import { stagewiseProviderType } from './providers/stagewise';
import {
  getCodingPlanVendor,
  type CodingPlanConfig,
} from './providers/coding-plan';
import { VENDOR_API_SPECS } from './providers/official-api';
import { OPENROUTER_PROVIDER_MAP } from './providers/shared';

type ProviderOptions = Parameters<typeof streamText>[0]['providerOptions'];
type BuiltInModelSettings = (typeof availableModels)[number];

export type { ProviderMode } from './reasoning-signatures';

// ============================================================================
// Instance resolution helpers
// ============================================================================

/**
 * Resolve the effective `ApiSpec` for a provider type + instance config.
 * Most types declare `apiSpec` directly. The `coding-plan` type resolves
 * it dynamically via the vendor's api type.
 */
function getEffectiveApiSpec(
  type: ProviderType,
  config: unknown,
): ApiSpec | undefined {
  if (type.apiSpec) return type.apiSpec;
  if (type.id === 'coding-plan') {
    const vendor = getCodingPlanVendor(config as CodingPlanConfig);
    return VENDOR_API_SPECS[vendor];
  }
  return undefined;
}

function getOpenRouterSemanticProvider(
  modelId: string,
): ModelProvider | undefined {
  const prefix = modelId.replace(/^~/, '').split('/', 1)[0];
  if (Object.hasOwn(VENDOR_API_SPECS, prefix)) {
    return prefix as ModelProvider;
  }

  return (
    Object.entries(OPENROUTER_PROVIDER_MAP) as [ModelProvider, string][]
  ).find(([, openRouterPrefix]) => openRouterPrefix === prefix)?.[0];
}

export type ModelWithOptions = {
  model: LanguageModelV3;
  providerOptions: Parameters<typeof streamText>[0]['providerOptions'];
  headers: Record<string, string>;
  contextWindowSize: number;
  providerMode: ProviderMode;
  connectedCodingPlanId?: string;
  reasoningSignatureSource: ReasoningSignatureSource;
  /**
   * When true, the agent must strip the `strict` field from every tool
   * definition before passing them to `streamText`. Required for providers
   * whose backend rejects unknown fields on the tool payload — notably
   * Bedrock-on-Anthropic, where `strict` surfaces as
   * `tools.0.custom.strict: Extra inputs are not permitted`.
   */
  stripStrictFromTools?: boolean;
};

/**
 * This class offers a getter for a model that is traced with the telemetry service.
 *
 * Routing logic:
 *   - Built-in models default to **Stagewise Inference** unless the user has
 *     configured the model's `officialProvider` to use `official` or `custom` mode.
 *   - Custom models route through their configured provider instance.
 *   - Provider options on each model definition already use per-provider keys
 *     (e.g. `{ anthropic: { … }, stagewise: { … } }`) and are passed through as-is.
 */
export class ModelProviderService {
  private readonly telemetryService: TelemetryService;
  private readonly authService: AuthService;
  private readonly preferencesService: PreferencesService;

  public constructor(
    telemetryService: TelemetryService,
    authService: AuthService,
    preferencesService: PreferencesService,
  ) {
    this.telemetryService = telemetryService;
    this.authService = authService;
    this.preferencesService = preferencesService;
  }

  private report(
    error: Error,
    operation: string,
    extra?: Record<string, unknown>,
  ) {
    this.telemetryService.captureException(error, {
      service: 'model-provider',
      operation,
      ...extra,
    });
  }

  /**
   * Decrypt all `sensitiveFields` declared by a provider type from the
   * instance config, returning a map of field-name → decrypted-value.
   */
  private decryptSensitiveFields(
    instance: ProviderInstance,
    type: ProviderType,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    const config = instance.config as Record<string, unknown>;
    for (const field of type.sensitiveFields) {
      const encrypted = config[field] as string | undefined;
      if (encrypted) {
        result[field] =
          this.preferencesService.decryptProviderApiKey(encrypted);
      }
    }
    return result;
  }

  /**
   * Resolve the base URL for a provider instance. Coding plans may define a
   * dedicated subscription endpoint, which takes precedence over the vendor
   * API default after an explicit instance override.
   */
  private static resolveInstanceBaseURL(
    instance: ProviderInstance,
    type: ProviderType,
  ): string | undefined {
    const config = instance.config as Record<string, unknown>;
    const baseUrl =
      typeof config.baseUrl === 'string' ? config.baseUrl.trim() : undefined;
    if (baseUrl) return baseUrl;

    if (instance.typeId === 'coding-plan') {
      const planConfig = config as CodingPlanConfig;
      const plan = CODING_PLANS[planConfig.planId as keyof typeof CODING_PLANS];
      return (
        plan?.baseUrl ??
        getProviderTypeByVendor(getCodingPlanVendor(planConfig)).defaultBaseUrl
      );
    }

    return type.defaultBaseUrl;
  }

  // ===========================================================================
  // Vendor endpoint resolution (built-in models)
  // ===========================================================================

  /**
   * Resolve credentials, base URL, and provider type for a given vendor.
   * Falls back to the shared stagewise instance when no vendor-specific
   * instance exists.
   */
  private resolveVendorEndpoint(provider: ModelProvider): {
    instance: ProviderInstance | undefined;
    type: ProviderType;
    apiKey: string;
    baseURL: string | undefined;
    decryptedConfig: Record<string, string>;
    connectedCodingPlanId?: string;
  } {
    const prefs = this.preferencesService.get();
    const proxyBaseUrl =
      process.env.LLM_PROXY_URL || 'https://llm.stagewise.io';

    const instance = findInstanceForVendor(prefs, provider);
    if (!instance || instance.typeId === 'stagewise') {
      return {
        instance: undefined,
        type: stagewiseProviderType,
        apiKey: this.authService.accessToken ?? '',
        baseURL: proxyBaseUrl,
        decryptedConfig: {},
      };
    }

    const type = getProviderType(instance.typeId);
    const config = instance.config as Record<string, unknown>;
    const decryptedConfig = this.decryptSensitiveFields(instance, type);
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    const baseURL = ModelProviderService.resolveInstanceBaseURL(instance, type);

    if (instance.typeId === 'coding-plan') {
      return {
        instance,
        type,
        apiKey,
        baseURL,
        decryptedConfig,
        connectedCodingPlanId: (config as CodingPlanConfig).planId,
      };
    }

    return {
      instance,
      type,
      apiKey,
      baseURL,
      decryptedConfig,
    };
  }

  // ===========================================================================
  // Instance-by-ID resolution (PR 3 model × instance path)
  // ===========================================================================

  /**
   * Resolve a built-in model's credentials by a specific provider instance ID.
   *
   * This is the PR 3 path: the UI selects a `(instanceId, modelId)` pair, and
   * the routing layer resolves the instance directly rather than via
   * vendor-based routing.
   *
   * - `stagewise` instance → Stagewise Inference (same as vendor fallback).
   * - `coding-plan` / `*-api` instance → delegate to `resolveVendorEndpoint`
   *   using the vendor derived from the instance type, but use the instance's
   *   own config for decryption.
   * - Custom-type instances (custom-anthropic, bedrock, etc.) → resolve
   *   credentials directly from the instance config.
   */
  private resolveInstanceById(
    instanceId: string,
    officialProvider: ModelProvider | undefined,
  ): {
    instance: ProviderInstance | undefined;
    type: ProviderType;
    apiKey: string;
    baseURL: string | undefined;
    decryptedConfig: Record<string, string>;
    connectedCodingPlanId?: string;
  } {
    const prefs = this.preferencesService.get();
    const instance = prefs.providerInstances.find((i) => i.id === instanceId);
    if (!instance) {
      // Legacy migrated custom models use this well-known Stagewise sentinel
      // even when the provider instance was not persisted by older versions.
      if (instanceId === 'stagewise-default') {
        return {
          instance: undefined,
          type: stagewiseProviderType,
          apiKey: this.authService.accessToken ?? '',
          baseURL: process.env.LLM_PROXY_URL || 'https://llm.stagewise.io',
          decryptedConfig: {} as Record<string, string>,
        };
      }
      throw new Error(`Provider instance ${instanceId} not found`);
    }

    // Stagewise instance → inference path (same as no-vendor fallback).
    if (instance.typeId === 'stagewise') {
      return {
        instance: undefined,
        type: stagewiseProviderType,
        apiKey: this.authService.accessToken ?? '',
        baseURL: process.env.LLM_PROXY_URL || 'https://llm.stagewise.io',
        decryptedConfig: {} as Record<string, string>,
      };
    }

    const type = getProviderType(instance.typeId);
    const config = instance.config as Record<string, unknown>;
    const decryptedConfig = this.decryptSensitiveFields(instance, type);
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    const baseURL = ModelProviderService.resolveInstanceBaseURL(instance, type);

    if (instance.typeId === 'coding-plan') {
      return {
        instance,
        type,
        apiKey,
        baseURL,
        decryptedConfig,
        connectedCodingPlanId: (config as CodingPlanConfig).planId,
      };
    }

    // For vendor-api instances, use the vendor's official base URL as
    // fallback when the instance config doesn't set one.
    if (instance.typeId.endsWith('-api') && officialProvider) {
      const vendorType = getProviderTypeByVendor(officialProvider);
      const effectiveBaseURL = baseURL ?? vendorType.defaultBaseUrl;
      return {
        instance,
        type,
        apiKey,
        baseURL: effectiveBaseURL,
        decryptedConfig,
      };
    }

    return { instance, type, apiKey, baseURL, decryptedConfig };
  }

  // ===========================================================================
  // Custom model instance resolution
  // ===========================================================================

  /**
   * Resolve credentials for a custom model's provider instance reference.
   * The `providerInstanceId` can be a vendor-backed instance id (e.g.
   * `anthropic-api-default`) or a custom-type instance id.
   */
  private resolveCustomModelInstance(providerInstanceId: string): {
    instance: ProviderInstance;
    type: ProviderType;
    apiKey: string;
    baseURL: string | undefined;
    decryptedConfig: Record<string, string>;
    apiSpec: ApiSpec | undefined;
  } {
    const prefs = this.preferencesService.get();
    const instance = prefs.providerInstances.find(
      (i) => i.id === providerInstanceId,
    );
    if (!instance) {
      throw new Error(`Provider instance ${providerInstanceId} not found`);
    }

    if (instance.typeId === 'stagewise') {
      throw new Error(
        `Provider instance ${providerInstanceId} is a stagewise instance with no resolvable vendor`,
      );
    }

    const type = getProviderType(instance.typeId);
    const config = instance.config as Record<string, unknown>;

    const decryptedConfig = this.decryptSensitiveFields(instance, type);
    const apiKey = decryptedConfig.encryptedApiKey ?? '';

    if (instance.typeId === 'coding-plan') {
      const planConfig = config as CodingPlanConfig;
      const vendor = getCodingPlanVendor(planConfig);
      return {
        instance,
        type,
        apiKey,
        baseURL: ModelProviderService.resolveInstanceBaseURL(instance, type),
        decryptedConfig,
        apiSpec: VENDOR_API_SPECS[vendor],
      };
    }

    if (instance.typeId.endsWith('-api')) {
      const vendor = instance.typeId.slice(0, -4) as ModelProvider;
      return {
        instance,
        type,
        apiKey,
        baseURL:
          ModelProviderService.resolveInstanceBaseURL(instance, type) ??
          getProviderTypeByVendor(vendor).defaultBaseUrl,
        decryptedConfig,
        apiSpec: VENDOR_API_SPECS[vendor],
      };
    }

    // Custom-type instance.
    return {
      instance,
      type,
      apiKey,
      baseURL: ModelProviderService.resolveInstanceBaseURL(instance, type),
      decryptedConfig,
      apiSpec: type.apiSpec,
    };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Check whether a model ID can be resolved. Discovered models are
   * instance-scoped, so they require their owning instance ID.
   */
  public modelExists(modelId: ModelId, providerInstanceId?: string): boolean {
    const preferences = this.preferencesService.get();
    const providerInstance = providerInstanceId
      ? preferences.providerInstances?.find(
          (instance) => instance.id === providerInstanceId,
        )
      : undefined;

    if (!providerInstanceId) {
      return (
        !!getAvailableModel(modelId) ||
        preferences.customModels.some((model) => model.modelId === modelId)
      );
    }

    // Older preferences can reference the well-known Stagewise route without
    // persisting a corresponding instance. Preserve only that compatibility
    // route; every other missing explicit instance fails closed.
    if (!providerInstance) {
      if (providerInstanceId !== 'stagewise-default') return false;
      return (
        !!getAvailableModel(modelId) ||
        preferences.customModels.some(
          (model) =>
            model.modelId === modelId &&
            (model.providerInstanceId ?? model.endpointId) ===
              'stagewise-default',
        )
      );
    }

    return !!findModelSelectorEntry(preferences, providerInstanceId, modelId);
  }

  /**
   * Get a model usable by AI-SDK alongside provider options and headers.
   *
   * Provider options from the model definition are returned as-is — they
   * already carry per-provider keys (e.g. `{ anthropic: {…}, stagewise: {…} }`).
   * Call-sites should use `deepMergeProviderOptions` to layer additional overrides.
   */
  public getModelWithOptions(
    modelId: ModelId,
    traceId: string,
    otherPostHogProperties?: Record<string, unknown>,
    providerInstanceId?: string,
  ): ModelWithOptions {
    try {
      return this.createModelWithOptions(
        modelId,
        traceId,
        otherPostHogProperties,
        providerInstanceId,
      );
    } catch (error) {
      this.report(error as Error, 'getModelWithOptions', {
        modelId,
        providerInstanceId,
      });
      throw error;
    }
  }

  private createModelWithOptions(
    modelId: ModelId,
    traceId: string,
    otherPostHogProperties?: Record<string, unknown>,
    providerInstanceId?: string,
  ): ModelWithOptions {
    const preferences = this.preferencesService.get();
    const selectedInstance = providerInstanceId
      ? preferences.providerInstances?.find(
          (candidate) => candidate.id === providerInstanceId,
        )
      : undefined;

    // An explicit instance is part of the model identity. Failing closed here
    // prevents a deleted discovered route from silently becoming a Stagewise
    // catalog route when the two models share an ID.
    if (
      providerInstanceId &&
      !selectedInstance &&
      providerInstanceId !== 'stagewise-default'
    ) {
      throw new Error(`Provider instance ${providerInstanceId} not found`);
    }

    const selectedCustom = providerInstanceId
      ? preferences.customModels.find(
          (candidate) =>
            candidate.modelId === modelId &&
            (candidate.providerInstanceId ?? candidate.endpointId) ===
              providerInstanceId,
        )
      : undefined;
    if (selectedCustom) {
      return this.createCustomModelWithOptions(
        selectedCustom,
        traceId,
        otherPostHogProperties,
      );
    }

    // Resolve the selected (instanceId, modelId) pair before the global
    // catalog. Self-hosted and aggregator instances can expose literal model
    // IDs that collide with catalog IDs or aliases. Only prefer discovery when
    // the selector exposes that pair as a discovered entry; vendor instances
    // intentionally deduplicate matching discoveries in favor of the catalog.
    if (providerInstanceId && selectedInstance) {
      const discovered = selectedInstance.discoveredModels?.find(
        (candidate) => candidate.modelId === modelId,
      );
      const selectorEntry = findModelSelectorEntry(
        preferences,
        providerInstanceId,
        modelId,
      );
      if (discovered && selectorEntry && !selectorEntry.catalogModel) {
        return this.createDiscoveredModelWithOptions(
          selectedInstance,
          discovered,
          traceId,
          otherPostHogProperties,
        );
      }
    }

    const builtIn = getAvailableModel(modelId);
    if (builtIn) {
      const alias = getModelAlias(modelId);
      return this.createBuiltInModelWithOptions(
        builtIn,
        traceId,
        alias,
        alias
          ? {
              ...otherPostHogProperties,
              requestedModelId: alias.modelId,
            }
          : otherPostHogProperties,
        providerInstanceId,
      );
    }

    const custom = providerInstanceId
      ? undefined
      : preferences.customModels.find((m) => m.modelId === modelId);
    if (custom) {
      return this.createCustomModelWithOptions(
        custom,
        traceId,
        otherPostHogProperties,
      );
    }

    // Discovered models (self-hosted providers) — require providerInstanceId
    if (selectedInstance) {
      const discovered = (selectedInstance.discoveredModels ?? []).find(
        (dm) => dm.modelId === modelId,
      );
      if (discovered) {
        return this.createDiscoveredModelWithOptions(
          selectedInstance,
          discovered,
          traceId,
          otherPostHogProperties,
        );
      }
    }

    throw new Error(`Model ${modelId} not found`);
  }

  // ===========================================================================
  // Built-in model creation
  // ===========================================================================

  private createBuiltInModelWithOptions(
    modelSettings: BuiltInModelSettings,
    traceId: string,
    alias: ModelAlias | undefined,
    otherPostHogProperties: Record<string, unknown> | undefined,
    providerInstanceId?: string,
  ): ModelWithOptions {
    const officialProvider = modelSettings.officialProvider as
      | ModelProvider
      | undefined;

    // ── Instance resolution ───────────────────────────────────────────────
    // When a providerInstanceId is given, resolve directly by ID. This is
    // the PR 3 model × instance path: the UI selected a specific instance.
    // Otherwise fall back to vendor-based routing for backward compat.
    let resolved: ReturnType<typeof this.resolveVendorEndpoint> & {
      instance: ProviderInstance | undefined;
    };

    if (providerInstanceId) {
      resolved = this.resolveInstanceById(providerInstanceId, officialProvider);
    } else {
      resolved = officialProvider
        ? this.resolveVendorEndpoint(officialProvider)
        : {
            instance: undefined,
            type: stagewiseProviderType,
            apiKey: this.authService.accessToken ?? '',
            baseURL: process.env.LLM_PROXY_URL || 'https://llm.stagewise.io',
            decryptedConfig: {} as Record<string, string>,
          };
    }

    const { type, apiKey, baseURL, decryptedConfig, instance } = resolved;
    const headers = modelSettings.headers ?? {};
    const baseProviderOptions = modelSettings.providerOptions as Record<
      string,
      unknown
    >;
    const posthogProperties = omitModelRequestMetadata(otherPostHogProperties);

    // ── Thinking override lookup (instance-aware) ─────────────────────────
    // Look up the override by the instance that serves this model. Fall back
    // to the stagewise-default instance key for legacy data, then to the
    // alias preset.
    const thinkingOverrides =
      this.preferencesService.get().agent.modelThinkingOverrides;
    const instanceKey = instance?.id ?? 'stagewise-default';
    const thinkingOverride =
      alias?.thinkingPreset ??
      thinkingOverrides[instanceKey]?.[modelSettings.modelId] ??
      thinkingOverrides['stagewise-default']?.[modelSettings.modelId];

    const posthogConfig = {
      posthogTraceId: traceId,
      posthogProperties: {
        posthogTraceId: traceId,
        modelId: modelSettings.modelId,
        ...posthogProperties,
      },
    };

    // ── Resolve effective apiSpec for thinking + reasoning signatures ───────
    const instanceConfig = instance?.config ?? {};
    const effectiveApiSpec = getEffectiveApiSpec(type, instanceConfig);

    // ── Apply model ID mapping from instance config (if any) ────────────────
    const modelIdMapping = (instanceConfig as Record<string, unknown>)
      .modelIdMapping as Record<string, string> | undefined;
    const explicitMappedModelId = modelIdMapping?.[modelSettings.modelId];
    const mappedModelId = explicitMappedModelId ?? modelSettings.modelId;

    // ── Incompatible-specs guard ────────────────────────────────────────────
    // Built-in models routed through cloud endpoints (azure/bedrock/vertex)
    // require a model ID mapping — the native IDs are provider-specific.
    const incompatibleSpecs = new Set<ApiSpec>([
      'azure',
      'amazon-bedrock',
      'google-vertex',
    ]);
    if (
      effectiveApiSpec &&
      incompatibleSpecs.has(effectiveApiSpec) &&
      mappedModelId === modelSettings.modelId
    ) {
      throw new Error(
        `Built-in model "${modelSettings.modelId}" cannot be routed through a ${effectiveApiSpec} endpoint because it requires provider-specific model IDs. ` +
          `Add a model ID mapping on the custom endpoint, or create a custom model with the correct ${effectiveApiSpec} model identifier instead.`,
      );
    }

    // ── Apply wire-format model ID transform ────────────────────────────────
    // Compatible transports do not necessarily own the catalog vendor's
    // native model-ID convention (for example MiniMax via custom OpenAI).
    // Apply an explicit mapping first, then use the transport transform when
    // available or the official vendor transform as the compatibility fallback.
    const wireModelId =
      explicitMappedModelId ??
      type.toWireModelId?.(mappedModelId, officialProvider) ??
      (officialProvider
        ? getProviderTypeByVendor(officialProvider).toWireModelId?.(
            mappedModelId,
            officialProvider,
          )
        : undefined) ??
      mappedModelId;

    // ── Create the language model via the provider type ─────────────────────
    const { model: rawModel, middleware } = type.createLanguageModel({
      modelId: wireModelId,
      apiKey,
      baseURL,
      config: instanceConfig as never,
      decryptedConfig,
      vendor: officialProvider,
    });

    // Apply middleware wrapping (stagewise URL passthrough, etc.)
    let model = rawModel;
    if (middleware?.length) {
      for (const mw of middleware) {
        model = wrapLanguageModel({ model, middleware: mw });
      }
    }

    // ── Reasoning signature source ──────────────────────────────────────────
    // Stagewise uses the wire-format (prefixed) model ID; official/custom
    // use the mapped (pre-wire) model ID — preserving the prior convention.
    // Official routes retain the catalog vendor even when they use a shared
    // wire protocol (for example, DeepSeek's OpenAI-compatible API). Custom
    // endpoints do not have a trustworthy vendor, so their semantic provider
    // remains protocol-derived. Stagewise models already use their catalog
    // vendor above.
    const semanticProvider =
      type.providerMode === 'custom' && effectiveApiSpec
        ? getSemanticProviderForApiSpec(effectiveApiSpec)
        : ((officialProvider ??
            (effectiveApiSpec
              ? getSemanticProviderForApiSpec(effectiveApiSpec)
              : undefined)) as ModelProvider);

    const reasoningModelId =
      type.providerMode === 'stagewise' ? wireModelId : mappedModelId;

    const reasoningSignatureSource =
      type.providerMode === 'custom'
        ? createReasoningSignatureSource(
            'custom',
            semanticProvider,
            reasoningModelId,
            {
              apiSpec: effectiveApiSpec as ApiSpec,
              endpointId: instance?.id ?? '',
            },
          )
        : createReasoningSignatureSource(
            type.providerMode as 'stagewise' | 'official',
            semanticProvider,
            reasoningModelId,
          );

    return {
      model: this.telemetryService.withTracing(model, posthogConfig),
      headers,
      providerOptions: resolveThinkingProviderOptions({
        baseProviderOptions,
        modelSettings,
        override: thinkingOverride,
        providerMode: type.providerMode,
        semanticProvider,
        customEndpointApiSpec: effectiveApiSpec,
        requestMetadata: otherPostHogProperties,
      }),
      contextWindowSize: modelSettings.modelContextRaw,
      providerMode: type.providerMode,
      ...(resolved.connectedCodingPlanId
        ? { connectedCodingPlanId: resolved.connectedCodingPlanId }
        : {}),
      reasoningSignatureSource,
      ...(type.stripStrictFromTools ? { stripStrictFromTools: true } : {}),
    };
  }

  // ===========================================================================
  // Custom model creation
  // ===========================================================================

  private createCustomModelWithOptions(
    customModel: CustomModel,
    traceId: string,
    otherPostHogProperties?: Record<string, unknown>,
  ): ModelWithOptions {
    const result = this.createCustomModelBase(
      customModel,
      traceId,
      otherPostHogProperties,
    );
    return { ...result, providerMode: 'custom' };
  }

  private createCustomModelBase(
    customModel: CustomModel,
    traceId: string,
    otherPostHogProperties?: Record<string, unknown>,
  ): Omit<ModelWithOptions, 'providerMode'> {
    const providerInstanceId =
      customModel.providerInstanceId ?? customModel.endpointId;
    if (!providerInstanceId) {
      throw new Error(
        `Custom model ${customModel.modelId} has no provider instance`,
      );
    }
    // Legacy custom models routed through Stagewise retain their vendor in
    // endpointId because the shared instance alone cannot resolve it.
    const legacyStagewiseVendor =
      providerInstanceId === 'stagewise-default' && customModel.endpointId
        ? (customModel.endpointId as ModelProvider)
        : undefined;
    const resolved = legacyStagewiseVendor
      ? {
          // endpointId is vendor metadata for the shared Stagewise route, not
          // permission to select a newer vendor-specific BYOK/plan instance.
          ...this.resolveInstanceById(
            providerInstanceId,
            legacyStagewiseVendor,
          ),
          apiSpec: getEffectiveApiSpec(
            getProviderTypeByVendor(legacyStagewiseVendor),
            {},
          ),
        }
      : this.resolveCustomModelInstance(providerInstanceId);
    const { type, apiKey, baseURL, decryptedConfig, apiSpec, instance } =
      resolved;

    const headers = customModel.headers ?? {};
    const posthogProperties = omitModelRequestMetadata(otherPostHogProperties);

    const posthogConfig = {
      posthogTraceId: traceId,
      posthogProperties: {
        posthogTraceId: traceId,
        modelId: customModel.modelId,
        isCustomModel: true,
        ...posthogProperties,
      },
    };

    // ── Wire-format model ID ────────────────────────────────────────────────
    const vendor = legacyStagewiseVendor
      ? legacyStagewiseVendor
      : instance?.typeId === 'coding-plan'
        ? getCodingPlanVendor(instance.config as CodingPlanConfig)
        : undefined;
    const wireModelId =
      type.toWireModelId?.(customModel.modelId, vendor) ?? customModel.modelId;

    // ── Create the language model via the provider type ─────────────────────
    const { model: rawModel, middleware } = type.createLanguageModel({
      modelId: wireModelId,
      apiKey,
      baseURL,
      config: (instance?.config ?? {}) as never,
      decryptedConfig,
      vendor,
    });

    let model = rawModel;
    if (middleware?.length) {
      for (const mw of middleware) {
        model = wrapLanguageModel({ model, middleware: mw });
      }
    }

    // ── Provider options wrapping ───────────────────────────────────────────
    const providerKey = apiSpec?.startsWith('openai-') ? 'openai' : apiSpec;
    const providerOptions =
      Object.keys(customModel.providerOptions).length > 0
        ? ({ [providerKey as string]: customModel.providerOptions } as Record<
            string,
            unknown
          >)
        : {};

    // ── Reasoning signature source ──────────────────────────────────────────
    const semanticProvider = apiSpec
      ? getSemanticProviderForApiSpec(apiSpec)
      : ('openai' as ModelProvider);

    const reasoningSignatureSource = createReasoningSignatureSource(
      'custom',
      semanticProvider,
      customModel.modelId,
      {
        apiSpec: apiSpec as ApiSpec,
        endpointId: instance?.id ?? providerInstanceId,
      },
    );

    return {
      model: this.telemetryService.withTracing(model, posthogConfig),
      headers,
      providerOptions: providerOptions as Parameters<
        typeof streamText
      >[0]['providerOptions'],
      contextWindowSize: customModel.contextWindowSize,
      reasoningSignatureSource,
      ...(type.stripStrictFromTools ? { stripStrictFromTools: true } : {}),
    };
  }

  // ===========================================================================
  // Discovered model creation (self-hosted providers)
  // ===========================================================================

  private createDiscoveredModelWithOptions(
    instance: ProviderInstance,
    discovered: DiscoveredModel,
    traceId: string,
    otherPostHogProperties?: Record<string, unknown>,
  ): ModelWithOptions {
    const type = getProviderType(instance.typeId);
    const baseURL = ModelProviderService.resolveInstanceBaseURL(instance, type);
    const apiSpec = getEffectiveApiSpec(type, instance.config);
    if (!apiSpec) {
      throw new Error(
        `Cannot resolve apiSpec for discovered model on instance ${instance.id} (type: ${instance.typeId})`,
      );
    }

    const vendor =
      type.vendor ??
      (instance.typeId === 'coding-plan'
        ? getCodingPlanVendor(instance.config as CodingPlanConfig)
        : undefined);
    const wireModelId =
      type.toWireModelId?.(discovered.modelId, vendor) ?? discovered.modelId;
    const decryptedConfig = this.decryptSensitiveFields(instance, type);

    const { model: rawModel, middleware } = type.createLanguageModel({
      modelId: wireModelId,
      apiKey: decryptedConfig.encryptedApiKey ?? '',
      baseURL,
      config: instance.config as never,
      decryptedConfig,
      vendor,
    });

    let model = rawModel;
    if (middleware?.length) {
      for (const mw of middleware) {
        model = wrapLanguageModel({ model, middleware: mw });
      }
    }

    const posthogConfig = {
      posthogTraceId: traceId,
      posthogProperties: {
        posthogTraceId: traceId,
        modelId: discovered.modelId,
        isDiscoveredModel: true,
        providerType: instance.typeId,
        ...omitModelRequestMetadata(otherPostHogProperties),
      },
    };

    // Discovered models rarely report context windows (the OpenAI-compatible
    // /v1/models endpoint doesn't include this field). Default to 128k — a
    // realistic floor for modern cloud models used in an agentic IDE.
    const contextWindow = discovered.contextWindow ?? 128_000;

    // ── Reasoning signature source ──────────────────────────────────────────
    // Official discovered models retain their known vendor. OpenRouter model
    // IDs conventionally start with the upstream vendor (for example,
    // `anthropic/claude-opus-4.8`); preserve that semantic owner so reasoning
    // signatures cannot cross between vendor protocols. Its request transport
    // remains OpenAI-compatible below.
    const openRouterVendor =
      instance.typeId === 'openrouter'
        ? getOpenRouterSemanticProvider(discovered.modelId)
        : undefined;
    const semanticProvider =
      vendor ?? openRouterVendor ?? getSemanticProviderForApiSpec(apiSpec);
    // OpenRouter is an official provider with an OpenAI-compatible protocol.
    // Its signatures retain the routed model vendor, while thinking options use
    // the compatible wire format below.
    const thinkingProvider: ThinkingProvider | undefined =
      instance.typeId === 'openrouter' ? 'openai-compatible' : undefined;
    const reasoningSignatureSource =
      type.providerMode === 'custom'
        ? createReasoningSignatureSource(
            'custom',
            semanticProvider,
            discovered.modelId,
            { apiSpec: apiSpec as ApiSpec, endpointId: instance.id },
          )
        : createReasoningSignatureSource(
            type.providerMode as 'stagewise' | 'official',
            semanticProvider,
            discovered.modelId,
          );

    // ── Thinking override lookup (instance-aware) ─────────────────────────
    // Same pattern as the catalog path — look up the override by the
    // instance that serves this discovered model.
    const thinkingOverrides =
      this.preferencesService.get().agent.modelThinkingOverrides;
    const thinkingOverride =
      thinkingOverrides[instance.id]?.[discovered.modelId];

    const thinkingModel: ThinkingCapableModel = {
      modelId: discovered.modelId,
      providerOptions: {},
      officialProvider: vendor,
      thinkingEnabled: discovered.thinkingEnabled,
    };

    const resolvedProviderOptions = resolveThinkingProviderOptions({
      baseProviderOptions: {},
      modelSettings: thinkingModel,
      override: thinkingOverride,
      providerMode: type.providerMode,
      semanticProvider,
      thinkingProvider,
      customEndpointApiSpec: apiSpec as ApiSpec,
      requestMetadata: otherPostHogProperties,
    });

    return {
      model: this.telemetryService.withTracing(model, posthogConfig),
      headers: {},
      providerOptions: resolvedProviderOptions,
      contextWindowSize: contextWindow,
      providerMode: type.providerMode,
      reasoningSignatureSource,
      ...(type.stripStrictFromTools ? { stripStrictFromTools: true } : {}),
    };
  }
}

// =============================================================================
// Thinking override utilities
// =============================================================================

type ThinkingProviderOptionsInput = {
  baseProviderOptions: Record<string, unknown>;
  modelSettings: ThinkingCapableModel;
  override?: ModelThinkingOverride;
  providerMode: ProviderMode;
  semanticProvider: ModelProvider;
  thinkingProvider?: ThinkingProvider;
  customEndpointApiSpec?: ApiSpec;
  requestMetadata?: Record<string, unknown>;
};

function resolveThinkingProviderOptions({
  baseProviderOptions,
  modelSettings,
  override,
  providerMode,
  semanticProvider,
  thinkingProvider,
  customEndpointApiSpec,
  requestMetadata,
}: ThinkingProviderOptionsInput): ProviderOptions {
  if (requestMetadata?.[MODEL_REQUEST_PURPOSE_METADATA_KEY] !== 'agent-step') {
    return baseProviderOptions as ProviderOptions;
  }

  if (!modelSettings.thinkingEnabled) {
    return baseProviderOptions as ProviderOptions;
  }

  const route = {
    providerMode,
    modelProvider: semanticProvider,
    thinkingProvider,
    customEndpointApiSpec,
  };

  if (!override) {
    // Catalog definitions own their curated default provider options. Preserve
    // them when they cover the active transport; otherwise add only the
    // missing transport-specific default (e.g. Claude via OpenAI-compatible).
    const activeThinkingProvider = getThinkingProviderForRoute(route);
    // The OpenAI-compatible transport is represented as the `openai` key in
    // AI SDK provider options, not by its semantic routing label.
    const activeProviderOptionsKey =
      activeThinkingProvider === 'openai-compatible'
        ? 'openai'
        : activeThinkingProvider;
    if (baseProviderOptions[activeProviderOptionsKey] !== undefined) {
      return baseProviderOptions as ProviderOptions;
    }

    const defaultSelection = getDefaultThinkingSelection(modelSettings, route);
    if (!defaultSelection?.enabled) {
      return baseProviderOptions as ProviderOptions;
    }

    const defaultPatch = createThinkingProviderOptionsPatch({
      model: modelSettings,
      route,
      override: {
        enabled: true,
        provider: defaultSelection.provider,
        value: defaultSelection.value,
      },
    });

    if (!defaultPatch) return baseProviderOptions as ProviderOptions;
    return deepMergeProviderOptions(baseProviderOptions, defaultPatch);
  }

  const patch = createThinkingProviderOptionsPatch({
    model: modelSettings,
    override,
    route,
  });

  if (!patch) return baseProviderOptions as ProviderOptions;

  return deepMergeProviderOptions(baseProviderOptions, patch);
}

function omitModelRequestMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return metadata;

  const {
    [MODEL_REQUEST_PURPOSE_METADATA_KEY]: _purpose,
    [PROVIDER_INSTANCE_ID_METADATA_KEY]: _providerInstanceId,
    ...telemetry
  } = metadata;
  return telemetry;
}

// =============================================================================
// Deep-merge utility for provider options
// =============================================================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively deep-merges multiple plain objects. Later sources win on
 * primitive conflicts; nested objects are merged recursively.
 *
 * Exported so call-sites (streamText / generateText) can layer overrides:
 * ```ts
 * streamText({
 *   providerOptions: deepMergeProviderOptions(
 *     modelWithOptions.providerOptions,
 *     { anthropic: { thinking: { type: 'disabled' } } },
 *   ),
 * })
 * ```
 */
export function deepMergeProviderOptions(
  ...sources: (Record<string, unknown> | undefined | null)[]
): ProviderOptions {
  const result: Record<string, unknown> = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) {
        delete result[key];
      } else if (isPlainObject(value) && isPlainObject(result[key])) {
        result[key] = deepMergeProviderOptions(
          result[key] as Record<string, unknown>,
          value,
        );
      } else {
        result[key] = value;
      }
    }
  }
  return result as ProviderOptions;
}
