import type {
  ApiSpec,
  ModelProvider,
} from './karton-contracts/ui/shared-types';

/**
 * Return the catalog provider whose protocol semantics an API spec follows.
 * This is used for provider options, thinking controls, and reasoning-signature
 * compatibility; it is not necessarily the service that hosts the endpoint.
 */
export function getSemanticProviderForApiSpec(apiSpec: ApiSpec): ModelProvider {
  switch (apiSpec) {
    case 'anthropic':
    case 'amazon-bedrock':
      return 'anthropic';
    case 'google':
    case 'google-vertex':
      return 'google';
    case 'openai-chat-completions':
    case 'openai-responses':
    case 'azure':
      return 'openai';
  }
}
