import { z } from 'zod';
import { credentialField, type CredentialTypeDefinition } from './types';

const schema = z.object({
  token: credentialField(),
});

type VercelPatShape = typeof schema.shape;

export const vercelPatCredentialType: CredentialTypeDefinition<VercelPatShape> =
  {
    displayName: 'Vercel Personal Access Token',
    description:
      'Personal Access Token for the Vercel REST API. Allows reading deployments, logs, projects, and environment variables.',
    schema,
    allowedOrigins: ['https://api.vercel.com'],
    fieldMetadata: {
      token: {
        description: 'Personal Access Token',
        helpText: 'Create one at vercel.com/account/tokens',
        helpUrl: 'https://vercel.com/account/tokens',
      },
    },
    onGet: async (current) => current,
  };
