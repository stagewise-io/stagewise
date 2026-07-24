import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderInstance } from '@shared/karton-contracts/ui/shared-types';

const mocks = vi.hoisted(() => ({
  updateProviderInstance: vi.fn(),
  refreshInstanceModels: vi.fn(),
}));

vi.mock('@ui/hooks/use-karton', () => ({
  useKartonState: vi.fn(() => ({ providerInstances: [] })),
  useKartonProcedure: vi.fn((selector) =>
    selector({
      preferences: {
        updateProviderInstance: mocks.updateProviderInstance,
        refreshInstanceModels: mocks.refreshInstanceModels,
      },
    }),
  ),
}));
vi.mock('@ui/hooks/use-track', () => ({ useTrack: () => vi.fn() }));
vi.mock('@ui/hooks/use-is-truncated', () => ({
  useIsTruncated: () => ({ ref: { current: null }, isTruncated: false }),
}));

import { CodingPlanEndpointConnection } from './models-providers-section';

const instance = {
  id: 'qwen-token',
  typeId: 'coding-plan',
  name: 'Qwen Token Plan',
  config: {
    planId: 'qwen-token-plan',
    encryptedApiKey: 'encrypted-key',
    baseUrl:
      'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
  },
  enabledModelIds: [],
  disabledModelIds: [],
  discoveredModels: [],
} satisfies ProviderInstance;

describe('CodingPlanEndpointConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateProviderInstance.mockResolvedValue(undefined);
    mocks.refreshInstanceModels.mockResolvedValue([]);
  });

  it('normalizes and saves an endpoint without replacing credentials', async () => {
    render(<CodingPlanEndpointConnection instance={instance} />);
    fireEvent.change(screen.getByDisplayValue(instance.config.baseUrl), {
      target: { value: ' https://token-plan.eu.example.com/v1/ ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.refreshInstanceModels).toHaveBeenCalledWith(instance.id),
    );
    expect(mocks.updateProviderInstance).toHaveBeenCalledWith(instance.id, {
      baseUrl: 'https://token-plan.eu.example.com/v1',
    });
    expect(mocks.updateProviderInstance).not.toHaveBeenCalledWith(
      instance.id,
      expect.objectContaining({ encryptedApiKey: expect.anything() }),
    );
  });

  it('shows both errors when discovery and rollback fail', async () => {
    mocks.refreshInstanceModels.mockRejectedValueOnce(new Error('Unavailable'));
    mocks.updateProviderInstance
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Rollback unavailable'));
    render(<CodingPlanEndpointConnection instance={instance} />);
    fireEvent.change(screen.getByDisplayValue(instance.config.baseUrl), {
      target: { value: 'https://broken.example.com/v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'Unavailable Failed to restore the previous endpoint: Rollback unavailable',
      ),
    ).toBeTruthy();
    expect(screen.getByDisplayValue(instance.config.baseUrl)).toBeTruthy();
  });

  it('restores the previous endpoint when discovery fails', async () => {
    mocks.refreshInstanceModels.mockRejectedValueOnce(new Error('Unavailable'));
    render(<CodingPlanEndpointConnection instance={instance} />);
    fireEvent.change(screen.getByDisplayValue(instance.config.baseUrl), {
      target: { value: 'https://broken.example.com/v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.updateProviderInstance).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(mocks.updateProviderInstance).toHaveBeenNthCalledWith(
      2,
      instance.id,
      {
        baseUrl: instance.config.baseUrl,
      },
    );
  });
});
