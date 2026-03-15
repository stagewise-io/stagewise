import { z } from 'zod';
import { credentialField, type CredentialTypeDefinition } from './types';

const schema = z.object({
  accessToken: credentialField(),
});

type SupabasePatShape = typeof schema.shape;

export const supabasePatCredentialType: CredentialTypeDefinition<SupabasePatShape> =
  {
    displayName: 'Supabase Access Token',
    description:
      'Personal Access Token for the Supabase Management API. Allows listing projects, running SQL queries, managing edge functions, secrets, and migrations.',
    schema,
    allowedOrigins: ['https://api.supabase.com'],
    fieldMetadata: {
      accessToken: {
        description: 'Personal Access Token',
        helpText: 'Create one at supabase.com/dashboard/account/tokens',
        helpUrl: 'https://supabase.com/dashboard/account/tokens',
      },
    },
    onGet: async (current) => current,
  };
