import { z } from 'zod';
import { credentialField, type CredentialTypeDefinition } from './types';

const schema = z.object({
  token: credentialField(),
});

type GithubPatShape = typeof schema.shape;

export const githubPatCredentialType: CredentialTypeDefinition<GithubPatShape> =
  {
    displayName: 'GitHub Personal Access Token',
    description:
      'Personal Access Token for the GitHub REST API. Allows interacting with repositories, issues, pull requests, actions, and more.',
    schema,
    allowedOrigins: ['https://api.github.com'],
    fieldMetadata: {
      token: {
        description: 'Personal Access Token',
        helpText: 'Create one at github.com/settings/tokens',
        helpUrl: 'https://github.com/settings/tokens',
      },
    },
    onGet: async (current) => current,
  };
