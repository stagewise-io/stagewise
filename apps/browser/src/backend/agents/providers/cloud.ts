import type { LanguageModelV3 } from '@ai-sdk/provider';
import { createAzure } from '@ai-sdk/azure';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromIni, fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { createVertex } from '@ai-sdk/google-vertex';
import type { ApiSpec } from '@shared/karton-contracts/ui/shared-types';
import type { ProviderType } from './types';

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

export const azureProviderType: ProviderType<AzureConfig> = {
  id: 'azure',
  displayName: 'Azure OpenAI',
  description: 'Azure-hosted OpenAI models',
  category: 'cloud',
  providerMode: 'custom',
  apiSpec: 'azure' satisfies ApiSpec,
  sensitiveFields: ['encryptedApiKey'],

  createLanguageModel({ modelId, apiKey, baseURL, config }): {
    model: LanguageModelV3;
  } {
    const provider = createAzure({
      apiKey,
      baseURL,
      resourceName: config.resourceName,
      apiVersion: config.apiVersion,
    });
    return { model: provider(modelId as never) };
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
      region: overrideRegion,
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
  return createAmazonBedrock({
    region: overrideRegion ?? 'us-east-1',
    accessKeyId: apiKey,
    secretAccessKey: decryptedSecretKey,
  });
}

export const bedrockProviderType: ProviderType<BedrockConfig> = {
  id: 'bedrock',
  displayName: 'Amazon Bedrock',
  description: 'AWS-hosted models via Bedrock',
  category: 'cloud',
  providerMode: 'custom',
  apiSpec: 'amazon-bedrock' satisfies ApiSpec,
  sensitiveFields: ['encryptedApiKey', 'encryptedSecretKey'],
  stripStrictFromTools: true,

  createLanguageModel({ modelId, apiKey, decryptedConfig, config }): {
    model: LanguageModelV3;
  } {
    const decryptedSecretKey = decryptedConfig.encryptedSecretKey ?? '';
    const provider = buildBedrockProvider(config, apiKey, decryptedSecretKey);
    return { model: provider(modelId as never) };
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

export const vertexProviderType: ProviderType<VertexConfig> = {
  id: 'vertex',
  displayName: 'Google Vertex AI',
  description: 'Google Cloud-hosted models via Vertex AI',
  category: 'cloud',
  providerMode: 'custom',
  apiSpec: 'google-vertex' satisfies ApiSpec,
  sensitiveFields: ['encryptedGoogleCredentials'],

  createLanguageModel({ modelId, decryptedConfig, config }): {
    model: LanguageModelV3;
  } {
    const decryptedCredentials = decryptedConfig.encryptedGoogleCredentials;
    const provider = createVertex({
      project: config.projectId ?? '',
      location: config.location ?? 'us-central1',
      googleAuthOptions: decryptedCredentials
        ? { credentials: JSON.parse(decryptedCredentials) }
        : undefined,
    });
    return { model: provider(modelId as never) };
  },
};
