import type { TelemetryService } from '@/services/telemetry';
import type { ModelAlias, ModelId } from '@shared/available-models';
import type {
  ModelProvider,
  ApiSpec,
  CustomModel,
  CustomEndpoint,
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
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAzure } from '@ai-sdk/azure';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromIni, fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { createVertex } from '@ai-sdk/google-vertex';
import { createStagewise } from './stagewise-provider';
import type { AuthService } from '@/services/auth';
import type { PreferencesService } from '@/services/preferences';
import type { streamText, LanguageModelMiddleware } from 'ai';
import { wrapLanguageModel } from 'ai';
import { MODEL_REQUEST_PURPOSE_METADATA_KEY } from '@stagewise/agent-core/host';
import { createThinkingProviderOptionsPatch } from '@shared/model-thinking-capabilities';

type ProviderOptions = Parameters<typeof streamText>[0]['providerOptions'];
type BuiltInModelSettings = (typeof availableModels)[number];

/**
 * Converts an OpenRouter-style Anthropic model ID (dots in version, e.g.
 * `claude-opus-4.8`) to the native Anthropic API format (hyphens, e.g.
 * `claude-opus-4-8`). Idempotent on IDs that already use hyphens.
 */
function toNativeAnthropicModelId(modelId: string): string {
  return modelId.replace(/\./g, '-');
}

function toNativeMiniMaxModelId(modelId: string): string {
  if (modelId === 'minimax-m3') return 'MiniMax-M3';
  return modelId;
}

/**
 * Middleware that tells the SDK all HTTP(S) URLs are natively supported by the
 * stagewise gateway. Without this the SDK downloads every image/file URL and
 * inlines the content as base64, causing "payload too large" errors.
 */
const stagewiseUrlPassthroughMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  overrideSupportedUrls: () => ({
    '*': [/^https?:\/\//i],
  }),
};

export type { ProviderMode } from './reasoning-signatures';

// ============================================================================
// Provider instance helpers
// ============================================================================

/** Maps a provider instance `typeId` back to the legacy `ApiSpec`. */
const INSTANCE_TYPE_ID_TO_API_SPEC: Record<string, ApiSpec> = {
  'custom-anthropic': 'anthropic',
  'custom-openai-chat': 'openai-chat-completions',
  'custom-openai-responses': 'openai-responses',
  'custom-google': 'google',
  azure: 'azure',
  bedrock: 'amazon-bedrock',
  vertex: 'google-vertex',
};

/** Maps a vendor to the `ApiSpec` used when a custom model routes via that vendor. */
const VENDOR_TO_API_SPEC: Record<ModelProvider, ApiSpec> = {
  anthropic: 'anthropic',
  openai: 'openai-responses',
  google: 'google',
  moonshotai: 'openai-chat-completions',
  alibaba: 'openai-chat-completions',
  deepseek: 'openai-chat-completions',
  'z-ai': 'openai-chat-completions',
  minimax: 'openai-chat-completions',
  'xiaomi-mimo': 'openai-chat-completions',
  mistral: 'openai-chat-completions',
};

/**
 * Build a `CustomEndpoint`-shaped view from a provider instance so that the
 * existing `createModelViaEndpoint` / `buildBedrockProvider` methods can
 * consume it without internal changes. This is a mechanical data-source
 * swap — PR 1 keeps the endpoint-shaped routing surface intact.
 */
function providerInstanceToCustomEndpoint(
  instance: ProviderInstance,
): CustomEndpoint {
  const apiSpec = INSTANCE_TYPE_ID_TO_API_SPEC[instance.typeId];
  if (!apiSpec) {
    throw new Error(
      `providerInstanceToCustomEndpoint: typeId ${instance.typeId} is not a custom-endpoint type`,
    );
  }
  // Access `instance.config` inside each case so TypeScript narrows the
  // discriminated union per typeId.
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
 *   - Custom models route through their configured endpoint.
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
   * Resolve credentials and base URL for a given provider by looking up
   * the provider instance assigned to that vendor. Falls back to the
   * shared stagewise instance when no vendor-specific instance exists.
   */
  private resolveProviderEndpoint(provider: ModelProvider): {
    apiKey: string;
    baseURL: string | undefined;
    mode: 'stagewise' | 'official' | 'custom';
    connectedCodingPlanId?: string;
    customEndpoint?: CustomEndpoint;
  } {
    const prefs = this.preferencesService.get();
    const proxyBaseUrl =
      process.env.LLM_PROXY_URL || 'https://llm.stagewise.io';

    const instance = findInstanceForVendor(prefs, provider);
    if (!instance || instance.typeId === 'stagewise') {
      return {
        apiKey: this.authService.accessToken ?? '',
        baseURL: proxyBaseUrl,
        mode: 'stagewise',
      };
    }

    if (instance.typeId === 'coding-plan') {
      const cfg = instance.config;
      return {
        apiKey: this.preferencesService.decryptProviderApiKey(
          cfg.encryptedApiKey,
        ),
        baseURL: cfg.baseUrl,
        mode: 'official',
        connectedCodingPlanId: cfg.planId,
      };
    }

    if (instance.typeId.endsWith('-api')) {
      // `-api` is a suffix match, so TS cannot narrow the discriminated
      // union. All vendor-api configs share the `officialApiConfig` shape.
      const cfg = instance.config as {
        encryptedApiKey?: string;
        baseUrl?: string;
      };
      return {
        apiKey: this.preferencesService.decryptProviderApiKey(
          cfg.encryptedApiKey,
        ),
        baseURL: cfg.baseUrl,
        mode: 'official',
      };
    }

    // Custom-type instance serving this vendor.
    const endpoint = providerInstanceToCustomEndpoint(instance);
    return {
      apiKey: this.preferencesService.decryptProviderApiKey(
        endpoint.encryptedApiKey,
      ),
      baseURL: endpoint.baseUrl || undefined,
      mode: 'custom',
      customEndpoint: endpoint,
    };
  }

  /**
   * Resolve credentials for a custom model's provider instance reference.
   * The `providerInstanceId` can be a vendor-backed instance id (e.g.
   * `anthropic-api-default`) or a custom-type instance id.
   */
  private resolveProviderInstance(providerInstanceId: string): {
    apiKey: string;
    baseURL: string | undefined;
    apiSpec: ApiSpec;
    endpoint?: CustomEndpoint;
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
    if (instance.typeId === 'coding-plan') {
      const vendor =
        CODING_PLANS[instance.config.planId as keyof typeof CODING_PLANS]
          ?.provider;
      if (!vendor) {
        throw new Error(
          `Provider instance ${providerInstanceId} has no resolvable vendor`,
        );
      }
      const { apiKey, baseURL } = this.resolveProviderEndpoint(vendor);
      return { apiKey, baseURL, apiSpec: VENDOR_TO_API_SPEC[vendor] };
    }
    if (instance.typeId.endsWith('-api')) {
      const vendor = instance.typeId.slice(0, -4) as ModelProvider;
      const { apiKey, baseURL } = this.resolveProviderEndpoint(vendor);
      return { apiKey, baseURL, apiSpec: VENDOR_TO_API_SPEC[vendor] };
    }

    // Custom-type instance.
    const endpoint = providerInstanceToCustomEndpoint(instance);
    return {
      apiKey: this.preferencesService.decryptProviderApiKey(
        endpoint.encryptedApiKey,
      ),
      baseURL: endpoint.baseUrl || undefined,
      apiSpec: endpoint.apiSpec,
      endpoint,
    };
  }

  /**
   * Build an Amazon Bedrock provider for a custom endpoint based on its
   * configured auth mode:
   *
   * - `access-keys` (default, back-compat): static access key + secret.
   * - `profile`: named profile from `~/.aws/config` / `~/.aws/credentials`.
   *   Handles static, session-token, assume-role, and SSO profiles via the
   *   AWS SDK's standard refresh machinery. SSO profiles whose token has
   *   expired will surface an error at signing time — users must re-run
   *   `aws sso login --profile <name>`.
   * - `default-chain`: Node provider chain (env vars, shared credentials,
   *   EC2/ECS instance roles, IMDS).
   *
   * Region resolution: UI-entered `region` always wins. When empty:
   *   - `access-keys` falls back to `us-east-1` (preserves pre-feature
   *     behaviour for static-credential setups with no other region
   *     source).
   *   - `profile` and `default-chain` pass `undefined`, letting the AWS
   *     SDK resolve the region from the profile's `region` entry or the
   *     `AWS_REGION` / `AWS_DEFAULT_REGION` env vars.
   */
  private buildBedrockProvider(endpoint: CustomEndpoint, apiKey: string) {
    const mode = endpoint.awsAuthMode ?? 'access-keys';
    const overrideRegion = endpoint.region?.trim() || undefined;

    if (mode === 'profile') {
      if (!endpoint.awsProfileName) {
        throw new Error(
          'AWS profile name is required when awsAuthMode is "profile".',
        );
      }
      return createAmazonBedrock({
        // `region` intentionally undefined when the user did not override
        // it — `createAmazonBedrock` + the AWS SDK will resolve from the
        // profile's `region` entry or the `AWS_REGION` env var.
        region: overrideRegion,
        credentialProvider: fromIni({ profile: endpoint.awsProfileName }),
      });
    }

    if (mode === 'default-chain') {
      return createAmazonBedrock({
        region: overrideRegion,
        credentialProvider: fromNodeProviderChain(),
      });
    }

    // access-keys: no profile / env to fall back on, so keep the
    // historical `us-east-1` default to preserve behaviour for existing
    // setups.
    const secretAccessKey = this.preferencesService.decryptProviderApiKey(
      endpoint.encryptedSecretKey,
    );
    return createAmazonBedrock({
      region: overrideRegion ?? 'us-east-1',
      accessKeyId: apiKey,
      secretAccessKey,
    });
  }

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

  private createBuiltInModelWithOptions(
    modelSettings: BuiltInModelSettings,
    traceId: string,
    alias?: ModelAlias,
    otherPostHogProperties?: Record<string, unknown>,
  ): ModelWithOptions {
    const officialProvider = modelSettings.officialProvider as
      | ModelProvider
      | undefined;
    const resolved = officialProvider
      ? this.resolveProviderEndpoint(officialProvider)
      : { apiKey: '', baseURL: undefined, mode: 'stagewise' as const };
    const { apiKey, baseURL, mode, connectedCodingPlanId } = resolved;
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

    if (mode === 'stagewise') {
      if (!officialProvider) {
        throw new Error(
          `Model ${modelSettings.modelId} has no officialProvider set`,
        );
      }
      const proxyBaseUrl =
        process.env.LLM_PROXY_URL || 'https://llm.stagewise.io';
      // OpenRouter uses different provider prefixes for some vendors
      const OPENROUTER_PROVIDER_MAP: Partial<Record<ModelProvider, string>> = {
        alibaba: 'qwen',
        'xiaomi-mimo': 'xiaomi',
        mistral: 'mistralai',
      };
      const routerProvider =
        OPENROUTER_PROVIDER_MAP[officialProvider] ?? officialProvider;
      const prefixedModelId = `${routerProvider}/${modelSettings.modelId}`;
      const stagewiseProvider = createStagewise({
        apiKey: this.authService.accessToken ?? '',
        baseURL: proxyBaseUrl,
      });

      const model = wrapLanguageModel({
        model: stagewiseProvider.chatModel(prefixedModelId),
        middleware: stagewiseUrlPassthroughMiddleware,
      });

      return {
        model: this.telemetryService.withTracing(model, posthogConfig),
        headers,
        providerOptions: resolveThinkingProviderOptions({
          baseProviderOptions,
          modelSettings,
          override: thinkingOverride,
          providerMode: 'stagewise',
          semanticProvider: officialProvider,
          requestMetadata: otherPostHogProperties,
        }),
        contextWindowSize: modelSettings.modelContextRaw,
        providerMode: 'stagewise',
        reasoningSignatureSource: createReasoningSignatureSource(
          'stagewise',
          officialProvider,
          prefixedModelId,
        ),
      };
    }

    if (mode === 'custom' && resolved.customEndpoint) {
      const incompatibleSpecs = new Set([
        'azure',
        'amazon-bedrock',
        'google-vertex',
      ]);
      const defaultModelId =
        officialProvider === 'minimax'
          ? toNativeMiniMaxModelId(modelSettings.modelId)
          : modelSettings.modelId;
      const remappedModelId =
        resolved.customEndpoint.modelIdMapping?.[modelSettings.modelId] ??
        defaultModelId;
      if (
        incompatibleSpecs.has(resolved.customEndpoint.apiSpec) &&
        remappedModelId === modelSettings.modelId
      ) {
        throw new Error(
          `Built-in model "${modelSettings.modelId}" cannot be routed through a ${resolved.customEndpoint.apiSpec} endpoint because it requires provider-specific model IDs. ` +
            `Add a model ID mapping on the custom endpoint, or create a custom model with the correct ${resolved.customEndpoint.apiSpec} model identifier instead.`,
        );
      }
      return {
        ...this.createModelViaEndpoint(
          resolved.customEndpoint,
          remappedModelId,
          resolveThinkingProviderOptions({
            baseProviderOptions,
            modelSettings,
            override: thinkingOverride,
            providerMode: 'custom',
            semanticProvider: getSemanticProviderForApiSpec(
              resolved.customEndpoint.apiSpec,
            ),
            customEndpointApiSpec: resolved.customEndpoint.apiSpec,
            requestMetadata: otherPostHogProperties,
          }) as Record<string, unknown>,
          headers,
          modelSettings.modelContextRaw,
          posthogConfig,
        ),
        providerMode: 'custom',
      };
    }

    // Official mode — use native AI-SDK provider with the officialProvider
    if (!officialProvider) {
      throw new Error(
        `Model ${modelSettings.modelId} has no officialProvider set`,
      );
    }

    return {
      ...this.createOfficialModel(
        officialProvider,
        apiKey,
        baseURL,
        modelSettings.modelId,
        resolveThinkingProviderOptions({
          baseProviderOptions,
          modelSettings,
          override: thinkingOverride,
          providerMode: 'official',
          semanticProvider: officialProvider,
          requestMetadata: otherPostHogProperties,
        }) as Record<string, unknown>,
        headers,
        modelSettings.modelContextRaw,
        posthogConfig,
      ),
      providerMode: 'official',
      connectedCodingPlanId,
    };
  }

  /**
   * Create a model using the official AI-SDK provider for the given provider key.
   */
  private createOfficialModel(
    provider: ModelProvider,
    apiKey: string,
    baseURL: string | undefined,
    modelId: string,
    providerOptions: Record<string, unknown>,
    headers: Record<string, string>,
    contextWindowSize: number,
    posthogConfig: {
      posthogTraceId: string;
      posthogProperties: Record<string, unknown>;
    },
  ): Omit<ModelWithOptions, 'providerMode'> {
    const reasoningSignatureSource = createReasoningSignatureSource(
      'official',
      provider,
      modelId,
    );

    switch (provider) {
      case 'anthropic': {
        const p = createAnthropic({ apiKey, baseURL });
        return {
          model: this.telemetryService.withTracing(
            p(toNativeAnthropicModelId(modelId) as any),
            posthogConfig,
          ),
          headers,
          providerOptions: providerOptions as Parameters<
            typeof streamText
          >[0]['providerOptions'],
          contextWindowSize,
          reasoningSignatureSource,
        };
      }
      case 'openai': {
        const p = createOpenAI({ apiKey, baseURL });
        return {
          model: this.telemetryService.withTracing(
            p(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: providerOptions as Parameters<
            typeof streamText
          >[0]['providerOptions'],
          contextWindowSize,
          reasoningSignatureSource,
        };
      }
      case 'google': {
        const p = createGoogleGenerativeAI({ apiKey, baseURL });
        return {
          model: this.telemetryService.withTracing(
            p(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: providerOptions as Parameters<
            typeof streamText
          >[0]['providerOptions'],
          contextWindowSize,
          reasoningSignatureSource,
        };
      }
      case 'moonshotai': {
        const p = createOpenAI({
          apiKey,
          baseURL: baseURL ?? 'https://api.moonshot.ai/v1',
        });
        return {
          model: this.telemetryService.withTracing(
            // Moonshot's native API speaks Chat Completions, not Responses.
            // `createOpenAI()(id)` defaults to Responses — must use `.chat()`.
            p.chat(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: providerOptions as Parameters<
            typeof streamText
          >[0]['providerOptions'],
          contextWindowSize,
          reasoningSignatureSource,
        };
      }
      case 'alibaba': {
        const p = createOpenAI({
          apiKey,
          baseURL:
            baseURL ?? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        });
        return {
          model: this.telemetryService.withTracing(
            // Alibaba's DashScope speaks Chat Completions — use `.chat()`.
            p.chat(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: providerOptions as Parameters<
            typeof streamText
          >[0]['providerOptions'],
          contextWindowSize,
          reasoningSignatureSource,
        };
      }
      case 'deepseek': {
        const p = createOpenAI({
          apiKey,
          baseURL: baseURL ?? 'https://api.deepseek.com/v1',
        });
        return {
          model: this.telemetryService.withTracing(
            // DeepSeek's native API speaks Chat Completions — use `.chat()`.
            p.chat(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: providerOptions as Parameters<
            typeof streamText
          >[0]['providerOptions'],
          contextWindowSize,
          reasoningSignatureSource,
        };
      }
      case 'z-ai': {
        const p = createOpenAI({
          apiKey,
          baseURL: baseURL ?? 'https://api.z.ai/api/paas/v4',
        });
        return {
          model: this.telemetryService.withTracing(
            // Z.AI's OpenAI-compatible endpoint speaks Chat Completions.
            p.chat(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: providerOptions as Parameters<
            typeof streamText
          >[0]['providerOptions'],
          contextWindowSize,
          reasoningSignatureSource,
        };
      }
      case 'minimax': {
        const p = createOpenAI({
          apiKey,
          baseURL: baseURL ?? 'https://api.minimax.io/v1',
        });
        return {
          model: this.telemetryService.withTracing(
            // MiniMax's OpenAI-compatible endpoint speaks Chat Completions.
            p.chat(toNativeMiniMaxModelId(modelId) as any),
            posthogConfig,
          ),
          headers,
          providerOptions: providerOptions as Parameters<
            typeof streamText
          >[0]['providerOptions'],
          contextWindowSize,
          reasoningSignatureSource,
        };
      }
      case 'xiaomi-mimo': {
        const p = createOpenAI({
          apiKey,
          baseURL: baseURL ?? 'https://api.xiaomimimo.com/v1',
        });
        return {
          model: this.telemetryService.withTracing(
            // Xiaomi MiMo's OpenAI-compatible endpoint speaks Chat
            // Completions. Internal model IDs already match native API IDs.
            p.chat(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: providerOptions as Parameters<
            typeof streamText
          >[0]['providerOptions'],
          contextWindowSize,
          reasoningSignatureSource,
        };
      }
      case 'mistral': {
        const p = createOpenAI({
          apiKey,
          baseURL: baseURL ?? 'https://api.mistral.ai/v1',
        });
        return {
          model: this.telemetryService.withTracing(
            // Mistral's OpenAI-compatible endpoint speaks Chat
            // Completions. Internal model IDs already match native API IDs.
            p.chat(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: providerOptions as Parameters<
            typeof streamText
          >[0]['providerOptions'],
          contextWindowSize,
          reasoningSignatureSource,
        };
      }
      default: {
        const _exhaustive: never = provider;
        throw new Error(`Unsupported official provider: ${_exhaustive}`);
      }
    }
  }

  /**
   * Create a model routed through a specific custom endpoint config.
   */
  private createModelViaEndpoint(
    endpoint: CustomEndpoint,
    modelId: string,
    modelProviderOptions: Record<string, unknown>,
    headers: Record<string, string>,
    contextWindowSize: number,
    posthogConfig: {
      posthogTraceId: string;
      posthogProperties: Record<string, unknown>;
    },
  ): Omit<ModelWithOptions, 'providerMode'> {
    const apiKey = this.preferencesService.decryptProviderApiKey(
      endpoint.encryptedApiKey,
    );
    const baseURL = endpoint.baseUrl || undefined;
    const { apiSpec } = endpoint;
    const reasoningSignatureSource = createReasoningSignatureSource(
      'custom',
      getSemanticProviderForApiSpec(apiSpec),
      modelId,
      { apiSpec, endpointId: endpoint.id },
    );

    switch (apiSpec) {
      case 'anthropic': {
        const provider = createAnthropic({ apiKey, baseURL });
        return {
          model: this.telemetryService.withTracing(
            provider(toNativeAnthropicModelId(modelId) as any),
            posthogConfig,
          ),
          headers,
          providerOptions: modelProviderOptions as any,
          contextWindowSize,
          reasoningSignatureSource,
        };
      }

      case 'openai-chat-completions': {
        const provider = createOpenAI({ apiKey, baseURL });
        return {
          model: this.telemetryService.withTracing(
            provider.chat(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: modelProviderOptions as any,
          contextWindowSize,
          reasoningSignatureSource,
        };
      }

      case 'openai-responses': {
        const provider = createOpenAI({ apiKey, baseURL });
        return {
          model: this.telemetryService.withTracing(
            provider.responses(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: modelProviderOptions as any,
          contextWindowSize,
          reasoningSignatureSource,
        };
      }

      case 'google': {
        const provider = createGoogleGenerativeAI({ apiKey, baseURL });
        return {
          model: this.telemetryService.withTracing(
            provider(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: modelProviderOptions as any,
          contextWindowSize,
          reasoningSignatureSource,
        };
      }

      case 'azure': {
        const azureProvider = createAzure({
          apiKey,
          baseURL,
          resourceName: endpoint.resourceName,
          apiVersion: endpoint.apiVersion,
        });
        return {
          model: this.telemetryService.withTracing(
            azureProvider(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: modelProviderOptions as any,
          contextWindowSize,
          reasoningSignatureSource,
        };
      }

      case 'amazon-bedrock': {
        const bedrockProvider = this.buildBedrockProvider(endpoint, apiKey);
        return {
          model: this.telemetryService.withTracing(
            bedrockProvider(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: modelProviderOptions as any,
          contextWindowSize,
          reasoningSignatureSource,
          stripStrictFromTools: true,
        };
      }

      case 'google-vertex': {
        const vertexProvider = createVertex({
          project: endpoint.projectId ?? '',
          location: endpoint.location ?? 'us-central1',
          googleAuthOptions: endpoint.encryptedGoogleCredentials
            ? {
                credentials: JSON.parse(
                  this.preferencesService.decryptProviderApiKey(
                    endpoint.encryptedGoogleCredentials,
                  ),
                ),
              }
            : undefined,
        });
        return {
          model: this.telemetryService.withTracing(
            vertexProvider(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: modelProviderOptions as any,
          contextWindowSize,
          reasoningSignatureSource,
        };
      }
      default: {
        const _exhaustive: never = apiSpec;
        throw new Error(`Unsupported API spec: ${_exhaustive}`);
      }
    }
  }

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
    const { apiKey, baseURL, apiSpec, endpoint } = this.resolveProviderInstance(
      customModel.providerInstanceId ?? '',
    );
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

    if (
      endpoint &&
      (apiSpec === 'azure' ||
        apiSpec === 'amazon-bedrock' ||
        apiSpec === 'google-vertex')
    ) {
      return this.createModelViaEndpoint(
        endpoint,
        customModel.modelId,
        customModel.providerOptions,
        headers,
        customModel.contextWindowSize,
        posthogConfig,
      );
    }

    const providerKey = apiSpec.startsWith('openai-') ? 'openai' : apiSpec;
    const reasoningSignatureSource = createReasoningSignatureSource(
      'custom',
      getSemanticProviderForApiSpec(apiSpec),
      customModel.modelId,
      {
        apiSpec,
        endpointId: endpoint?.id ?? customModel.providerInstanceId ?? '',
      },
    );
    const providerOptions =
      Object.keys(customModel.providerOptions).length > 0
        ? ({ [providerKey]: customModel.providerOptions } as any)
        : {};

    switch (apiSpec) {
      case 'anthropic': {
        const provider = createAnthropic({ apiKey, baseURL });
        return {
          model: this.telemetryService.withTracing(
            provider(toNativeAnthropicModelId(customModel.modelId) as any),
            posthogConfig,
          ),
          headers,
          providerOptions,
          contextWindowSize: customModel.contextWindowSize,
          reasoningSignatureSource,
        };
      }

      case 'openai-chat-completions': {
        const provider = createOpenAI({ apiKey, baseURL });
        return {
          model: this.telemetryService.withTracing(
            provider.chat(customModel.modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions,
          contextWindowSize: customModel.contextWindowSize,
          reasoningSignatureSource,
        };
      }

      case 'openai-responses': {
        const provider = createOpenAI({ apiKey, baseURL });
        return {
          model: this.telemetryService.withTracing(
            provider.responses(customModel.modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions,
          contextWindowSize: customModel.contextWindowSize,
          reasoningSignatureSource,
        };
      }

      case 'google': {
        const provider = createGoogleGenerativeAI({ apiKey, baseURL });
        return {
          model: this.telemetryService.withTracing(
            provider(customModel.modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions,
          contextWindowSize: customModel.contextWindowSize,
          reasoningSignatureSource,
        };
      }

      case 'azure': {
        const ep = endpoint ?? ({} as CustomEndpoint);
        const azureProvider = createAzure({
          apiKey,
          baseURL,
          resourceName: ep.resourceName,
          apiVersion: ep.apiVersion,
        });
        return {
          model: this.telemetryService.withTracing(
            azureProvider(customModel.modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions,
          contextWindowSize: customModel.contextWindowSize,
          reasoningSignatureSource,
        };
      }

      case 'amazon-bedrock': {
        const ep = endpoint ?? ({} as CustomEndpoint);
        const bedrockProvider = this.buildBedrockProvider(ep, apiKey);
        return {
          model: this.telemetryService.withTracing(
            bedrockProvider(customModel.modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions,
          contextWindowSize: customModel.contextWindowSize,
          reasoningSignatureSource,
          stripStrictFromTools: true,
        };
      }

      case 'google-vertex': {
        const ep = endpoint ?? ({} as CustomEndpoint);
        const vertexProvider = createVertex({
          project: ep.projectId ?? '',
          location: ep.location ?? 'us-central1',
          googleAuthOptions: ep.encryptedGoogleCredentials
            ? {
                credentials: JSON.parse(
                  this.preferencesService.decryptProviderApiKey(
                    ep.encryptedGoogleCredentials,
                  ),
                ),
              }
            : undefined,
        });
        return {
          model: this.telemetryService.withTracing(
            vertexProvider(customModel.modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions,
          contextWindowSize: customModel.contextWindowSize,
          reasoningSignatureSource,
        };
      }
    }
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
