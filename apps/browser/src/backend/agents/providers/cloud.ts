import type { ImageModelV3, LanguageModelV3 } from '@ai-sdk/provider';
import { createAzure } from '@ai-sdk/azure';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromIni, fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { createVertex } from '@ai-sdk/google-vertex';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  ApiSpec,
  DiscoveredImageModel,
} from '@shared/karton-contracts/ui/shared-types';
import { PROVIDER_TYPE_DISPLAY_INFO } from '@shared/karton-contracts/ui/shared-types';
import { generateImage } from 'ai';
import { GOOGLE_IMAGE_MODELS } from './google-image';
import {
  generateOpenAIImageWithModel,
  OPENAI_IMAGE_MODELS,
} from './openai-image';
import type {
  ProviderImageGenerationRequest,
  ProviderImageGenerationResult,
  ProviderType,
} from './types';

const BEDROCK_IMAGE_MODELS: readonly DiscoveredImageModel[] = [
  {
    modelId: 'amazon.nova-canvas-v1:0',
    displayName: 'Amazon Nova Canvas',
    description: "Amazon's image generation model for studio-quality assets.",
    supportedParameters: {
      aspect_ratio: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      quality: ['standard', 'premium'],
    },
  },
];

const BEDROCK_SIZES: Record<string, `${number}x${number}`> = {
  '1:1': '1024x1024',
  '16:9': '1280x720',
  '9:16': '720x1280',
  '4:3': '1152x864',
  '3:4': '864x1152',
};

const AZURE_IMAGE_MODELS: readonly DiscoveredImageModel[] =
  OPENAI_IMAGE_MODELS.map((model) => ({
    ...model,
    supportedParameters: {
      ...model.supportedParameters,
      output_format: ['png', 'jpeg'],
    },
  }));

async function generateCloudImage(
  model: ImageModelV3,
  request: ProviderImageGenerationRequest,
  provider?: 'bedrock' | 'vertex',
): Promise<ProviderImageGenerationResult> {
  const useSize = provider === 'bedrock';
  const result = await generateImage({
    model,
    prompt: request.prompt,
    aspectRatio: useSize
      ? undefined
      : (request.aspectRatio as `${number}:${number}` | undefined),
    size: useSize ? BEDROCK_SIZES[request.aspectRatio ?? ''] : undefined,
    seed: request.seed,
    abortSignal: request.abortSignal,
    providerOptions:
      provider === 'bedrock' && request.quality
        ? { bedrock: { quality: request.quality } }
        : provider === 'vertex' && request.resolution
          ? {
              vertex: {
                imageConfig: {
                  aspectRatio: request.aspectRatio,
                  imageSize: request.resolution,
                },
              },
            }
          : undefined,
  });
  return { images: result.images };
}

// ============================================================================
// Azure OpenAI
// ============================================================================

export type AzureConfig = {
  encryptedApiKey?: string;
  baseUrl: string;
  resourceName?: string;
  apiVersion?: string;
  modelIdMapping?: Record<string, string>;
};

function buildAzureProvider(
  config: AzureConfig,
  apiKey: string,
  baseURL?: string,
  apiVersion = config.apiVersion,
) {
  return createAzure({
    apiKey,
    baseURL,
    resourceName: config.resourceName,
    apiVersion,
  });
}

export const azureProviderType: ProviderType<AzureConfig> = {
  id: 'azure',
  ...PROVIDER_TYPE_DISPLAY_INFO.azure,
  category: 'cloud',
  providerMode: 'custom',
  apiSpec: 'azure' satisfies ApiSpec,
  sensitiveFields: ['encryptedApiKey'],

  async getInitialImageModels() {
    return [...AZURE_IMAGE_MODELS];
  },

  createLanguageModel({ modelId, apiKey, baseURL, config }): {
    model: LanguageModelV3;
  } {
    const provider = buildAzureProvider(config, apiKey, baseURL);
    return { model: provider(modelId as never) };
  },

  generateImage({ modelId, apiKey, baseURL, config, request }) {
    const provider = buildAzureProvider(
      config,
      apiKey,
      baseURL,
      config.apiVersion ?? 'preview',
    );
    return generateOpenAIImageWithModel(provider.image(modelId), request);
  },
};

// ============================================================================
// Amazon Bedrock
// ============================================================================

export type BedrockConfig = {
  encryptedApiKey?: string;
  encryptedSecretKey?: string;
  region?: string;
  awsAuthMode: 'access-keys' | 'profile' | 'default-chain';
  awsProfileName?: string;
  modelIdMapping?: Record<string, string>;
};

/**
 * Build a Bedrock provider based on the configured auth mode:
 *
 * - `access-keys` (default): static access key + secret.
 * - `profile`: named profile from ~/.aws/config / ~/.aws/credentials.
 * - `default-chain`: Node provider chain (env vars, shared credentials,
 *   EC2/ECS instance roles, IMDS).
 *
 * `decryptedSecretKey` is only needed for `access-keys` mode and is
 * passed in already decrypted by the routing layer.
 */
export function resolveProfileRegion(profileName: string): string | undefined {
  try {
    const configPath =
      process.env.AWS_CONFIG_FILE?.trim() || join(homedir(), '.aws', 'config');
    const config = readFileSync(configPath, 'utf8');
    const section =
      profileName === 'default' ? 'default' : `profile ${profileName}`;
    const header = new RegExp(
      `^\\s*\\[${section.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\]\\s*$`,
      'm',
    );
    const match = header.exec(config);
    if (!match) return undefined;
    const content = config.slice(match.index + match[0].length);
    const nextHeader = content.search(/^\s*\[/m);
    const region = /^\s*region\s*=\s*(.+?)\s*$/m
      .exec(nextHeader === -1 ? content : content.slice(0, nextHeader))?.[1]
      ?.trim();
    return region || undefined;
  } catch {
    return undefined;
  }
}

function buildBedrockProvider(
  config: BedrockConfig,
  apiKey: string,
  decryptedSecretKey: string,
) {
  const mode = config.awsAuthMode ?? 'access-keys';
  const overrideRegion = config.region?.trim() || undefined;

  if (mode === 'profile') {
    if (!config.awsProfileName) {
      throw new Error(
        'AWS profile name is required when awsAuthMode is "profile".',
      );
    }
    return createAmazonBedrock({
      region: overrideRegion ?? resolveProfileRegion(config.awsProfileName),
      credentialProvider: fromIni({ profile: config.awsProfileName }),
    });
  }

  if (mode === 'default-chain') {
    return createAmazonBedrock({
      region: overrideRegion,
      credentialProvider: fromNodeProviderChain(),
    });
  }

  // access-keys
  if (!apiKey || !decryptedSecretKey) {
    throw new Error(
      'AWS access key ID and secret access key are required when awsAuthMode is "access-keys".',
    );
  }
  return createAmazonBedrock({
    region: overrideRegion ?? 'us-east-1',
    accessKeyId: apiKey,
    secretAccessKey: decryptedSecretKey,
  });
}

export const bedrockProviderType: ProviderType<BedrockConfig> = {
  id: 'bedrock',
  ...PROVIDER_TYPE_DISPLAY_INFO.bedrock,
  category: 'cloud',
  providerMode: 'custom',
  apiSpec: 'amazon-bedrock' satisfies ApiSpec,
  sensitiveFields: ['encryptedApiKey', 'encryptedSecretKey'],
  stripStrictFromTools: true,

  async getInitialImageModels() {
    return [...BEDROCK_IMAGE_MODELS];
  },

  createLanguageModel({ modelId, apiKey, decryptedConfig, config }): {
    model: LanguageModelV3;
  } {
    const decryptedSecretKey = decryptedConfig.encryptedSecretKey ?? '';
    const provider = buildBedrockProvider(config, apiKey, decryptedSecretKey);
    return { model: provider(modelId as never) };
  },

  generateImage({ modelId, apiKey, decryptedConfig, config, request }) {
    const provider = buildBedrockProvider(
      config,
      apiKey,
      decryptedConfig.encryptedSecretKey ?? '',
    );
    return generateCloudImage(provider.image(modelId), request, 'bedrock');
  },
};

// ============================================================================
// Google Vertex AI
// ============================================================================

export type VertexConfig = {
  encryptedGoogleCredentials?: string;
  projectId?: string;
  location?: string;
  modelIdMapping?: Record<string, string>;
};

function buildVertexProvider(
  config: VertexConfig,
  decryptedConfig: Record<string, string>,
) {
  const decryptedCredentials = decryptedConfig.encryptedGoogleCredentials;
  return createVertex({
    project: config.projectId?.trim() || undefined,
    location: config.location?.trim() || 'global',
    googleAuthOptions: decryptedCredentials
      ? { credentials: JSON.parse(decryptedCredentials) }
      : undefined,
  });
}

export const vertexProviderType: ProviderType<VertexConfig> = {
  id: 'vertex',
  ...PROVIDER_TYPE_DISPLAY_INFO.vertex,
  category: 'cloud',
  providerMode: 'custom',
  apiSpec: 'google-vertex' satisfies ApiSpec,
  sensitiveFields: ['encryptedGoogleCredentials'],

  async getInitialImageModels() {
    return [...GOOGLE_IMAGE_MODELS];
  },

  createLanguageModel({ modelId, decryptedConfig, config }): {
    model: LanguageModelV3;
  } {
    const provider = buildVertexProvider(config, decryptedConfig);
    return { model: provider(modelId as never) };
  },

  generateImage({ modelId, decryptedConfig, config, request }) {
    const provider = buildVertexProvider(config, decryptedConfig);
    return generateCloudImage(provider.image(modelId), request, 'vertex');
  },
};
