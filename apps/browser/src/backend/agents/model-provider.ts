import type { TelemetryService } from '@/services/telemetry';
import type { ModelAlias, ModelId } from '@shared/available-models';
import type {
  ModelProvider,
  ApiSpec,
  CustomModel,
  ModelThinkingOverride,
  ProviderInstance,
  UserPreferences,
} from '@shared/karton-contracts/ui/shared-types';
import type { ReasoningSignatureSource } from '@shared/karton-contracts/ui/agent/metadata';
import {
  createReasoningSignatureSource,
  getSemanticProviderForApiSpec,
  type ProviderMode,
} from './reasoning-signatures';
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
import { MODEL_REQUEST_PURPOSE_METADATA_KEY } from '@stagewise/agent-core/host';
import { createThinkingProviderOptionsPatch } from '@shared/model-thinking-capabilities';

// ── Provider type registry ──────────────────────────────────────────────────
import type { ProviderType } from './providers/types';
import { getProviderType } from './providers/registry';
import { stagewiseProviderType } from './providers/stagewise';
import {
  getCodingPlanVendor,
  type CodingPlanConfig,
} from './providers/coding-plan';
import { VENDOR_API_SPECS } from './providers/official-api';

type ProviderOptions = Parameters<typeof streamText>[0]['providerOptions'];
type BuiltInModelSettings = (typeof availableModels)[number];

export type { ProviderMode } from './reasoning-signatures';

// ============================================================================
// Instance resolution helpers
// ============================================================================

/**
 * Resolve which provider instance serves a given vendor.
 * Returns `undefined` when the vendor falls back to the shared stagewise
 * instance (i.e. no vendor-specific instance is configured).
 *
 * PR 1 hybrid: custom-mode vendors are linked to their instance via the
 * legacy `providerConfigs[vendor].customProviderId` field. The migration
 * reuses the endpoint ID as the instance ID, so the lookup is a direct
 * ID match.
 */
function findInstanceForVendor(
  prefs: UserPreferences,
  vendor: ModelProvider,
): ProviderInstance | undefined {
  const instances = prefs.providerInstances;
  const legacyConfig = prefs.providerConfigs?.[vendor];

  // The legacy `mode` is the source of truth for routing intent. When it is
  // set, resolve strictly by it so that a user who switched back to
  // 'stagewise' does not accidentally route through a leftover vendor-api
  // instance.
  if (legacyConfig) {
    switch (legacyConfig.mode) {
      case 'stagewise':
        return undefined;
      case 'custom':
        if (!legacyConfig.customProviderId) return undefined;
        return instances.find((i) => i.id === legacyConfig.customProviderId);
      case 'official':
        break; // fall through to instance scan below
    }
  }

  for (const instance of instances) {
    if (instance.typeId === 'stagewise') continue;
    if (instance.typeId.endsWith('-api')) {
      const v = instance.typeId.slice(0, -4); // strip `-api`
      if (v === vendor) return instance;
      continue;
    }
    if (instance.typeId === 'coding-plan') {
      const plan =
        CODING_PLANS[instance.config.planId as keyof typeof CODING_PLANS];
      if (plan?.provider === vendor) return instance;
      continue;
    }
  }
  return undefined;
}

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
 *   - Built-in models default to the **stagewise gateway** unless the user has
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
   * Resolve the base URL for a provider instance, preferring the user's
   * config and falling back to the type's `defaultBaseUrl`.
   */
  private static resolveBaseURL(
    config: Record<string, unknown>,
    type: ProviderType,
  ): string | undefined {
    const baseUrl = config.baseUrl as string | undefined;
    if (baseUrl) return baseUrl;
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
    const baseURL = ModelProviderService.resolveBaseURL(config, type);

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

    // Vendor-backed instance — delegate to the vendor resolver to pick up
    // stagewise fallback / coding-plan base URLs.
    if (instance.typeId === 'stagewise') {
      throw new Error(
        `Provider instance ${providerInstanceId} is a stagewise instance with no resolvable vendor`,
      );
    }

    const type = getProviderType(instance.typeId);
    const config = instance.config as Record<string, unknown>;

    // For coding-plan and vendor-api instances, resolve via the vendor
    // endpoint to pick up default base URLs and apiSpec.
    if (instance.typeId === 'coding-plan') {
      const vendor = getCodingPlanVendor(config as CodingPlanConfig);
      const resolved = this.resolveVendorEndpoint(vendor);
      // Use the coding-plan instance's own config for decryption, but
      // adopt the vendor resolver's baseURL fallback.
      return {
        instance,
        type,
        apiKey: resolved.apiKey,
        baseURL: config.baseUrl as string | undefined,
        decryptedConfig: this.decryptSensitiveFields(instance, type),
        apiSpec: VENDOR_API_SPECS[vendor],
      };
    }

    if (instance.typeId.endsWith('-api')) {
      const vendor = instance.typeId.slice(0, -4) as ModelProvider;
      const resolved = this.resolveVendorEndpoint(vendor);
      return {
        instance,
        type,
        apiKey: resolved.apiKey,
        baseURL: resolved.baseURL,
        decryptedConfig: resolved.decryptedConfig,
        apiSpec: VENDOR_API_SPECS[vendor],
      };
    }

    // Custom-type instance.
    const decryptedConfig = this.decryptSensitiveFields(instance, type);
    return {
      instance,
      type,
      apiKey: decryptedConfig.encryptedApiKey ?? '',
      baseURL: ModelProviderService.resolveBaseURL(config, type),
      decryptedConfig,
      apiSpec: type.apiSpec,
    };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Check whether a model ID exists (built-in or custom).
   */
  public modelExists(modelId: ModelId): boolean {
    if (getAvailableModel(modelId)) return true;
    return this.preferencesService
      .get()
      .customModels.some((m) => m.modelId === modelId);
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
  ): ModelWithOptions {
    try {
      return this.createModelWithOptions(
        modelId,
        traceId,
        otherPostHogProperties,
      );
    } catch (error) {
      this.report(error as Error, 'getModelWithOptions', { modelId });
      throw error;
    }
  }

  private createModelWithOptions(
    modelId: ModelId,
    traceId: string,
    otherPostHogProperties?: Record<string, unknown>,
  ): ModelWithOptions {
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
      );
    }

    const custom = this.preferencesService
      .get()
      .customModels.find((m) => m.modelId === modelId);
    if (custom) {
      return this.createCustomModelWithOptions(
        custom,
        traceId,
        otherPostHogProperties,
      );
    }

    throw new Error(`Model ${modelId} not found`);
  }

  // ===========================================================================
  // Built-in model creation
  // ===========================================================================

  private createBuiltInModelWithOptions(
    modelSettings: BuiltInModelSettings,
    traceId: string,
    alias?: ModelAlias,
    otherPostHogProperties?: Record<string, unknown>,
  ): ModelWithOptions {
    const officialProvider = modelSettings.officialProvider as
      | ModelProvider
      | undefined;

    // Resolve the vendor endpoint (or stagewise fallback).
    const resolved = officialProvider
      ? this.resolveVendorEndpoint(officialProvider)
      : {
          instance: undefined,
          type: stagewiseProviderType,
          apiKey: this.authService.accessToken ?? '',
          baseURL: process.env.LLM_PROXY_URL || 'https://llm.stagewise.io',
          decryptedConfig: {} as Record<string, string>,
        };

    const { type, apiKey, baseURL, decryptedConfig, instance } = resolved;
    const headers = modelSettings.headers ?? {};
    const baseProviderOptions = modelSettings.providerOptions as Record<
      string,
      unknown
    >;
    const posthogProperties = omitModelRequestMetadata(otherPostHogProperties);
    const thinkingOverride =
      alias?.thinkingPreset ??
      this.preferencesService.get().agent.modelThinkingOverrides[
        modelSettings.modelId
      ];

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
    const mappedModelId =
      modelIdMapping?.[modelSettings.modelId] ?? modelSettings.modelId;

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
    const wireModelId =
      type.toWireModelId?.(mappedModelId, officialProvider) ?? mappedModelId;

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
    const semanticProvider =
      type.providerMode === 'stagewise'
        ? (officialProvider as ModelProvider)
        : effectiveApiSpec
          ? getSemanticProviderForApiSpec(effectiveApiSpec)
          : (officialProvider as ModelProvider);

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
    const resolved = this.resolveCustomModelInstance(
      customModel.providerInstanceId ?? '',
    );
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
    const wireModelId =
      type.toWireModelId?.(customModel.modelId) ?? customModel.modelId;

    // ── Create the language model via the provider type ─────────────────────
    const { model: rawModel, middleware } = type.createLanguageModel({
      modelId: wireModelId,
      apiKey,
      baseURL,
      config: instance.config as never,
      decryptedConfig,
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
        endpointId: instance.id,
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
}

// =============================================================================
// Thinking override utilities
// =============================================================================

type ThinkingProviderOptionsInput = {
  baseProviderOptions: Record<string, unknown>;
  modelSettings: BuiltInModelSettings;
  override?: ModelThinkingOverride;
  providerMode: ProviderMode;
  semanticProvider: ModelProvider;
  customEndpointApiSpec?: ApiSpec;
  requestMetadata?: Record<string, unknown>;
};

function resolveThinkingProviderOptions({
  baseProviderOptions,
  modelSettings,
  override,
  providerMode,
  semanticProvider,
  customEndpointApiSpec,
  requestMetadata,
}: ThinkingProviderOptionsInput): ProviderOptions {
  if (requestMetadata?.[MODEL_REQUEST_PURPOSE_METADATA_KEY] !== 'agent-step') {
    return baseProviderOptions as ProviderOptions;
  }

  if (!modelSettings.thinkingEnabled || !override) {
    return baseProviderOptions as ProviderOptions;
  }

  const patch = createThinkingProviderOptionsPatch({
    model: modelSettings,
    override,
    route: {
      providerMode,
      modelProvider: semanticProvider,
      customEndpointApiSpec,
    },
  });

  if (!patch) return baseProviderOptions as ProviderOptions;

  return deepMergeProviderOptions(baseProviderOptions, patch);
}

function omitModelRequestMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata || !(MODEL_REQUEST_PURPOSE_METADATA_KEY in metadata)) {
    return metadata;
  }

  const { [MODEL_REQUEST_PURPOSE_METADATA_KEY]: _purpose, ...telemetry } =
    metadata;
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
