import { z } from 'zod';
import { credentialField, type CredentialTypeDefinition } from './types';

const schema = z.object({
  personalApiKey: credentialField(),
});

type PosthogPatShape = typeof schema.shape;

export const posthogPatCredentialType: CredentialTypeDefinition<PosthogPatShape> =
  {
    displayName: 'PostHog Personal API Key',
    description:
      'Personal API key for the PostHog REST API. Allows querying analytics data, managing feature flags, inspecting events and persons, and more.',
    schema,
    allowedOrigins: ['https://us.posthog.com', 'https://eu.posthog.com'],
    fieldMetadata: {
      personalApiKey: {
        description: 'Personal API Key (phx_...)',
        helpText:
          'Create one at Settings → Personal API Keys in your PostHog dashboard',
        helpUrl: 'https://us.posthog.com/settings/user-api-keys',
      },
    },
    onGet: async (current) => current,
  };
