import type { z } from 'zod';

export {
  credentialField,
  isCredentialFieldSchema,
  extractSecretFieldNames,
  type CredentialFieldValue,
  type CredentialFieldMetadata,
  type CredentialTypeDefinition,
  type ResolvedCredential,
  type SecretEntry,
} from './types';

import { figmaPatCredentialType } from './figma-pat';
import { googleAiKeyCredentialType } from './google-ai-key';
import { stagewiseAuthCredentialType } from './stagewise-auth';
import { vercelPatCredentialType } from './vercel-pat';
import { githubPatCredentialType } from './github-pat';
import { supabasePatCredentialType } from './supabase-pat';
import { posthogPatCredentialType } from './posthog-pat';

/**
 * Central registry of all credential type definitions.
 *
 * Adding a new credential type is a two-step process:
 * 1. Create a `<name>.ts` file with a `CredentialTypeDefinition`
 * 2. Add it to this registry object
 *
 * The `CredentialTypeId` union is derived automatically from the keys,
 * so plugins referencing `requiredCredentials` get compile-time checking.
 */
export const credentialTypeRegistry = {
  'figma-pat': figmaPatCredentialType,
  'google-ai-key': googleAiKeyCredentialType,
  'stagewise-auth': stagewiseAuthCredentialType,
  'vercel-pat': vercelPatCredentialType,
  'github-pat': githubPatCredentialType,
  'supabase-pat': supabasePatCredentialType,
  'posthog-pat': posthogPatCredentialType,
} as const;

/**
 * Type-safe union of all registered credential type IDs.
 * Derived from the registry keys so it stays in sync automatically.
 */
export type CredentialTypeId = keyof typeof credentialTypeRegistry;

/**
 * Extracts the plain input data type for a credential type ID.
 * Uses `z.input` so branded fields resolve to plain `string`,
 * matching what callers actually provide.
 */
export type CredentialInputData<T extends CredentialTypeId> = z.input<
  (typeof credentialTypeRegistry)[T]['schema']
>;
