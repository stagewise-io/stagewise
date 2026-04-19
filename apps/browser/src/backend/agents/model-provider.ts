import type { TelemetryService } from '@/services/telemetry';
import type { ModelId } from '@shared/available-models';
import type {
  ModelProvider,
  ApiSpec,
  CustomModel,
  CustomEndpoint,
} from '@shared/karton-contracts/ui/shared-types';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { availableModels } from '@shared/available-models';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAzure } from '@ai-sdk/azure';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createVertex } from '@ai-sdk/google-vertex';
import { createStagewise } from './stagewise-provider';
import type { AuthService } from '@/services/auth';
import type { PreferencesService } from '@/services/preferences';
import type { streamText, LanguageModelMiddleware } from 'ai';
import { wrapLanguageModel } from 'ai';

type ProviderOptions = Parameters<typeof streamText>[0]['providerOptions'];

/**
 * Converts an OpenRouter-style Anthropic model ID (dots in version, e.g.
 * `claude-opus-4.7`) to the native Anthropic API format (hyphens, e.g.
 * `claude-opus-4-7`). Idempotent on IDs that already use hyphens.
 */
function toNativeAnthropicModelId(modelId: string): string {
  return modelId.replace(/\./g, '-');
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

export type ProviderMode = 'stagewise' | 'official' | 'custom';

export type ModelWithOptions = {
  model: LanguageModelV3;
  providerOptions: Parameters<typeof streamText>[0]['providerOptions'];
  headers: Record<string, string>;
  contextWindowSize: number;
  providerMode: ProviderMode;
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
   * Resolve credentials and base URL for a given provider
   * based on the user's endpoint-mode preference.
   */
  private resolveProviderEndpoint(provider: ModelProvider): {
    apiKey: string;
    baseURL: string | undefined;
    mode: 'stagewise' | 'official' | 'custom';
    customEndpoint?: CustomEndpoint;
  } {
    const prefs = this.preferencesService.get();
    const config = prefs.providerConfigs[provider];
    const proxyBaseUrl =
      process.env.LLM_PROXY_URL || 'https://llm.stagewise.io';

    switch (config.mode) {
      case 'stagewise':
        return {
          apiKey: this.authService.accessToken ?? '',
          baseURL: proxyBaseUrl,
          mode: 'stagewise',
        };
      case 'official':
        return {
          apiKey: this.preferencesService.decryptProviderApiKey(
            config.encryptedApiKey,
          ),
          baseURL: undefined,
          mode: 'official',
        };
      case 'custom': {
        const endpoint = prefs.customEndpoints.find(
          (ep) => ep.id === config.customProviderId,
        );
        if (!endpoint) {
          return {
            apiKey: this.authService.accessToken ?? '',
            baseURL: proxyBaseUrl,
            mode: 'stagewise',
          };
        }
        return {
          apiKey: this.preferencesService.decryptProviderApiKey(
            endpoint.encryptedApiKey,
          ),
          baseURL: endpoint.baseUrl || undefined,
          mode: 'custom',
          customEndpoint: endpoint,
        };
      }
    }
  }

  /**
   * Resolve credentials for a custom model's endpoint reference
   * (which can be a built-in provider name or a custom endpoint id).
   */
  private resolveCustomEndpoint(endpointId: string): {
    apiKey: string;
    baseURL: string | undefined;
    apiSpec: ApiSpec;
    endpoint?: CustomEndpoint;
  } {
    if (
      endpointId === 'anthropic' ||
      endpointId === 'openai' ||
      endpointId === 'google' ||
      endpointId === 'moonshotai' ||
      endpointId === 'alibaba'
    ) {
      const { apiKey, baseURL } = this.resolveProviderEndpoint(endpointId);
      const apiSpecMap: Record<ModelProvider, ApiSpec> = {
        anthropic: 'anthropic',
        openai: 'openai-responses',
        google: 'google',
        moonshotai: 'openai-chat-completions',
        alibaba: 'openai-chat-completions',
      };
      return { apiKey, baseURL, apiSpec: apiSpecMap[endpointId] };
    }

    const endpoint = this.preferencesService
      .get()
      .customEndpoints.find((ep) => ep.id === endpointId);
    if (!endpoint) throw new Error(`Custom endpoint ${endpointId} not found`);

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
   * Check whether a model ID exists (built-in or custom).
   */
  public modelExists(modelId: ModelId): boolean {
    if (availableModels.some((m) => m.modelId === modelId)) return true;
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
    const builtIn = availableModels.find((m) => m.modelId === modelId);
    if (builtIn) {
      return this.createBuiltInModelWithOptions(
        builtIn,
        traceId,
        otherPostHogProperties,
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
    modelSettings: (typeof availableModels)[number],
    traceId: string,
    otherPostHogProperties?: Record<string, unknown>,
  ): ModelWithOptions {
    const officialProvider = modelSettings.officialProvider as
      | ModelProvider
      | undefined;
    const resolved = officialProvider
      ? this.resolveProviderEndpoint(officialProvider)
      : { apiKey: '', baseURL: undefined, mode: 'stagewise' as const };
    const { apiKey, baseURL, mode } = resolved;
    const headers = modelSettings.headers ?? {};

    const posthogConfig = {
      posthogTraceId: traceId,
      posthogProperties: {
        posthogTraceId: traceId,
        modelId: modelSettings.modelId,
        ...otherPostHogProperties,
      },
    };

    if (mode === 'stagewise') {
      const proxyBaseUrl =
        process.env.LLM_PROXY_URL || 'https://llm.stagewise.io';
      // OpenRouter uses different provider prefixes for some vendors
      const OPENROUTER_PROVIDER_MAP: Partial<Record<ModelProvider, string>> = {
        alibaba: 'qwen',
      };
      const routerProvider = officialProvider
        ? (OPENROUTER_PROVIDER_MAP[officialProvider] ?? officialProvider)
        : officialProvider;
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
        providerOptions: modelSettings.providerOptions as Parameters<
          typeof streamText
        >[0]['providerOptions'],
        contextWindowSize: modelSettings.modelContextRaw,
        providerMode: 'stagewise',
      };
    }

    if (mode === 'custom' && resolved.customEndpoint) {
      const incompatibleSpecs = new Set([
        'azure',
        'amazon-bedrock',
        'google-vertex',
      ]);
      const remappedModelId =
        resolved.customEndpoint.modelIdMapping?.[modelSettings.modelId] ??
        modelSettings.modelId;
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
          modelSettings.providerOptions as Record<string, unknown>,
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
        modelSettings.providerOptions as Record<string, unknown>,
        headers,
        modelSettings.modelContextRaw,
        posthogConfig,
      ),
      providerMode: 'official',
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
        };
      }
      case 'moonshotai': {
        const p = createOpenAI({
          apiKey,
          baseURL: baseURL ?? 'https://api.moonshot.ai/v1',
        });
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
            p(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: providerOptions as Parameters<
            typeof streamText
          >[0]['providerOptions'],
          contextWindowSize,
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
        };
      }

      case 'amazon-bedrock': {
        const secretAccessKey = this.preferencesService.decryptProviderApiKey(
          endpoint.encryptedSecretKey,
        );
        const bedrockProvider = createAmazonBedrock({
          region: endpoint.region ?? 'us-east-1',
          accessKeyId: apiKey,
          secretAccessKey,
        });
        return {
          model: this.telemetryService.withTracing(
            bedrockProvider(modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions: modelProviderOptions as any,
          contextWindowSize,
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
    const { apiKey, baseURL, apiSpec, endpoint } = this.resolveCustomEndpoint(
      customModel.endpointId,
    );
    const headers = customModel.headers ?? {};

    const posthogConfig = {
      posthogTraceId: traceId,
      posthogProperties: {
        posthogTraceId: traceId,
        modelId: customModel.modelId,
        isCustomModel: true,
        ...otherPostHogProperties,
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
        };
      }

      case 'amazon-bedrock': {
        const ep = endpoint ?? ({} as CustomEndpoint);
        const secretAccessKey = this.preferencesService.decryptProviderApiKey(
          ep.encryptedSecretKey,
        );
        const bedrockProvider = createAmazonBedrock({
          region: ep.region ?? 'us-east-1',
          accessKeyId: apiKey,
          secretAccessKey,
        });
        return {
          model: this.telemetryService.withTracing(
            bedrockProvider(customModel.modelId as any),
            posthogConfig,
          ),
          headers,
          providerOptions,
          contextWindowSize: customModel.contextWindowSize,
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
        };
      }
    }
  }
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
      if (isPlainObject(value) && isPlainObject(result[key])) {
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
