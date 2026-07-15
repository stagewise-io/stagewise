import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/hooks/use-karton', () => ({
  useKartonState: vi.fn(),
  useKartonProcedure: vi.fn(),
}));
vi.mock('@ui/hooks/use-track', () => ({ useTrack: vi.fn() }));

import { getCustomProviderSaveError } from './custom-providers-section';

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
