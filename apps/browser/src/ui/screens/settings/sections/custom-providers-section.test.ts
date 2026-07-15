import { describe, expect, it, vi } from 'vitest';
import type { CustomEndpoint } from '@shared/karton-contracts/ui/shared-types';

vi.mock('@ui/hooks/use-karton', () => ({
  useKartonState: vi.fn(),
  useKartonProcedure: vi.fn(),
}));
vi.mock('@ui/hooks/use-track', () => ({ useTrack: vi.fn() }));

import {
  getCustomProviderSaveError,
  shouldWarnAboutCredentialReentry,
} from './custom-providers-section';

describe('shouldWarnAboutCredentialReentry', () => {
  const endpoint: CustomEndpoint = {
    id: 'existing-endpoint',
    name: 'Existing endpoint',
    apiSpec: 'openai-chat-completions',
    baseUrl: 'https://example.com/v1',
    awsAuthMode: 'access-keys',
    encryptedApiKey: 'encrypted-key',
  };

  it('warns for same-domain provider type replacements with credentials', () => {
    expect(shouldWarnAboutCredentialReentry(endpoint, 'openai-responses')).toBe(
      true,
    );
  });

  it('does not warn when the provider type is unchanged', () => {
    expect(
      shouldWarnAboutCredentialReentry(endpoint, 'openai-chat-completions'),
    ).toBe(false);
  });
});

describe('getCustomProviderSaveError', () => {
  it('keeps the error message returned by a failed provider save', () => {
    expect(getCustomProviderSaveError(new Error('Invalid endpoint URL'))).toBe(
      'Invalid endpoint URL',
    );
  });

  it('uses a safe fallback for non-Error failures', () => {
    expect(getCustomProviderSaveError('network failure')).toBe(
      'Failed to save provider',
    );
  });
});
