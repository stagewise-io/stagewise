import { z } from 'zod';
import { credentialField, type CredentialTypeDefinition } from './types';

const schema = z.object({
  accessToken: credentialField(),
});

type StageWiseAuthShape = typeof schema.shape;

export const stagewiseAuthCredentialType: CredentialTypeDefinition<StageWiseAuthShape> =
  {
    displayName: 'Stagewise Access Token',
    description:
      'Automatically provided when you are signed in to stagewise. Grants access to the stagewise API.',
    schema,
    allowedOrigins: ['https://*.stagewise.io'],
    fieldMetadata: {},
    onGet: async (current) => current,
  };
