import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderInstance } from '@shared/karton-contracts/ui/shared-types';
import type { ProviderEntry } from './06-configure-providers';

const mocks = vi.hoisted(() => ({
  addProviderInstance: vi.fn(),
  openExternalUrl: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@ui/hooks/use-karton', () => ({
  useKartonState: vi.fn(),
  useKartonProcedure: vi.fn((selector) =>
    selector({
      preferences: { addProviderInstance: mocks.addProviderInstance },
      openExternalUrl: mocks.openExternalUrl,
    }),
  ),
}));
vi.mock('@ui/hooks/use-track', () => ({ useTrack: () => mocks.track }));

import {
  ConnectionDetailView,
  createProviderStepSummary,
  summarizeProviderInstances,
  TruncatedErrorText,
} from './06-configure-providers';

const ENTRY: ProviderEntry = {
  key: 'openai-api',
  displayName: 'OpenAI',
  tagline: 'OpenAI API',
  kind: 'vendor-api',
  typeId: 'openai-api',
};

function renderConnectionView(
  getNextAttemptNumber = vi.fn().mockReturnValue(1),
  onConnectionResult = vi.fn(),
) {
  const onBack = vi.fn();
  render(
    <ConnectionDetailView
      entry={ENTRY}
      onBack={onBack}
      onboardingRunId="run-1"
      getNextAttemptNumber={getNextAttemptNumber}
      onConnectionResult={onConnectionResult}
    />,
  );
  return { getNextAttemptNumber, onConnectionResult, onBack };
}

async function connectWithSecret(secret = 'sk-sensitive') {
  fireEvent.change(screen.getByPlaceholderText('Enter API key...'), {
    target: { value: secret },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(mocks.addProviderInstance).toHaveBeenCalled());
}

describe('TruncatedErrorText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reveals a truncated error after keyboard focus', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);

    render(<TruncatedErrorText text="The provider connection failed" />);

    const trigger = screen.getByRole('button', {
      name: 'The provider connection failed',
    });
    expect(trigger.getAttribute('tabindex')).toBe('0');
    expect(screen.getAllByText('The provider connection failed')).toHaveLength(
      1,
    );

    fireEvent.focus(trigger);

    expect(screen.getAllByText('The provider connection failed')).toHaveLength(
      2,
    );

    fireEvent.blur(trigger);
    expect(screen.getAllByText('The provider connection failed')).toHaveLength(
      1,
    );
  });

  it('does not add a tab stop when the error fits', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);

    render(<TruncatedErrorText text="Connection failed" />);

    expect(screen.getByRole('button').getAttribute('tabindex')).toBe('-1');
  });
});

describe('provider completion summary', () => {
  it('counts custom, cloud, duplicate, and coding-plan instances safely', () => {
    const instances = [
      {
        id: 'sensitive-custom-id',
        typeId: 'custom-openai-chat',
        name: 'Private endpoint',
        config: {
          baseUrl: 'https://sensitive.example.com',
          encryptedApiKey: 'encrypted-secret',
        },
      },
      {
        id: 'sensitive-azure-id',
        typeId: 'azure',
        name: 'Private Azure',
        config: {
          resourceName: 'sensitive-resource',
          deploymentName: 'sensitive-deployment',
          encryptedApiKey: 'encrypted-secret',
        },
      },
      {
        id: 'first-openai-id',
        typeId: 'openai-api',
        name: 'First OpenAI',
        config: { encryptedApiKey: 'encrypted-secret' },
      },
      {
        id: 'second-openai-id',
        typeId: 'openai-api',
        name: 'Second OpenAI',
        config: { encryptedApiKey: 'encrypted-secret' },
      },
      {
        id: 'coding-plan-id',
        typeId: 'coding-plan',
        name: 'Sensitive plan label',
        config: {
          planId: 'claude-code',
          encryptedApiKey: 'encrypted-secret',
        },
      },
    ] as ProviderInstance[];

    const summary = summarizeProviderInstances(instances);

    expect(summary).toEqual({
      connected_provider_count: 5,
      connected_provider_keys: [
        'custom-openai-chat',
        'azure',
        'openai-api',
        'openai-api',
        'plan:claude-code',
      ],
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('sensitive');
    expect(serialized).not.toContain('encrypted-secret');
  });

  it('reports an empty final provider configuration', () => {
    expect(summarizeProviderInstances([])).toEqual({
      connected_provider_count: 0,
      connected_provider_keys: [],
    });
  });

  it('classifies skip from run-local connections, not final providers', () => {
    const existingProvider = {
      id: 'existing-id',
      typeId: 'openai-api',
      name: 'Existing OpenAI',
      config: { encryptedApiKey: 'encrypted-secret' },
    } as ProviderInstance;

    expect(createProviderStepSummary([existingProvider], 0)).toEqual({
      connected_provider_count: 1,
      connected_provider_keys: ['openai-api'],
      provider_step_skipped: true,
    });
    expect(createProviderStepSummary([existingProvider], 1)).toEqual({
      connected_provider_count: 1,
      connected_provider_keys: ['openai-api'],
      provider_step_skipped: false,
    });
  });
});

describe('ConnectionDetailView telemetry', () => {
  beforeEach(() => {
    mocks.addProviderInstance.mockReset();
    mocks.openExternalUrl.mockReset();
    mocks.track.mockReset();
  });

  it('tracks an attempt and successful result without leaking the secret', async () => {
    mocks.addProviderInstance.mockResolvedValue({
      success: true,
      discoveredModels: [{ modelId: 'gpt-5' }, { modelId: 'gpt-5-mini' }],
    });
    const callbacks = renderConnectionView();

    await connectWithSecret();

    await waitFor(() => expect(callbacks.onBack).toHaveBeenCalledOnce());
    expect(mocks.track).toHaveBeenCalledWith(
      'onboarding-provider-connect-attempted',
      expect.objectContaining({
        onboarding_run_id: 'run-1',
        provider_key: 'openai-api',
        provider_type: 'openai-api',
        provider_kind: 'vendor-api',
        attempt_number: 1,
      }),
    );
    expect(mocks.track).toHaveBeenCalledWith(
      'onboarding-provider-connected',
      expect.objectContaining({
        attempt_number: 1,
        discovered_model_count: 2,
      }),
    );
    expect(callbacks.onConnectionResult).toHaveBeenCalledWith({
      entry: ENTRY,
      success: true,
    });
    expect(JSON.stringify(mocks.track.mock.calls)).not.toContain(
      'sk-sensitive',
    );
  });

  it('persists a normalized Token Plan endpoint without telemetry leakage', async () => {
    mocks.addProviderInstance.mockResolvedValue({
      success: true,
      discoveredModels: [],
    });
    const entry: ProviderEntry = {
      key: 'plan:qwen-token-plan',
      kind: 'coding-plan',
      typeId: 'alibaba-api',
      displayName: 'Qwen Token Plan',
      tagline: 'Token Plan',
      planId: 'qwen-token-plan',
      defaultBaseUrl:
        'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
      configurableEndpoint: {
        label: 'Token Plan endpoint',
        helpText: 'Use the dashboard endpoint.',
      },
    };
    render(
      <ConnectionDetailView
        entry={entry}
        onBack={vi.fn()}
        onboardingRunId="run-1"
        getNextAttemptNumber={() => 1}
        onConnectionResult={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByDisplayValue(entry.defaultBaseUrl!), {
      target: { value: ' https://token-plan.eu.example.com/v1/ ' },
    });
    await connectWithSecret();

    expect(mocks.addProviderInstance).toHaveBeenCalledWith({
      typeId: 'coding-plan',
      config: {
        planId: 'qwen-token-plan',
        baseUrl: 'https://token-plan.eu.example.com/v1',
      },
      validateApiKey: 'sk-sensitive',
    });
    const telemetry = JSON.stringify(mocks.track.mock.calls);
    expect(telemetry).not.toContain('token-plan.eu.example.com');
    expect(telemetry).not.toContain('sk-sensitive');
  });

  it('rejects an invalid Token Plan endpoint before calling the backend', async () => {
    const entry: ProviderEntry = {
      key: 'plan:qwen-token-plan',
      kind: 'coding-plan',
      typeId: 'alibaba-api',
      displayName: 'Qwen Token Plan',
      tagline: 'Token Plan',
      planId: 'qwen-token-plan',
      defaultBaseUrl: 'https://token-plan.example.com/v1',
      configurableEndpoint: {
        label: 'Token Plan endpoint',
        helpText: 'Use the dashboard endpoint.',
      },
    };
    render(
      <ConnectionDetailView
        entry={entry}
        onBack={vi.fn()}
        onboardingRunId="run-1"
        getNextAttemptNumber={() => 1}
        onConnectionResult={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByDisplayValue(entry.defaultBaseUrl!), {
      target: { value: 'http://token-plan.example.com/v1' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter API key...'), {
      target: { value: 'sk-sensitive' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(
      await screen.findByText('The API endpoint must use HTTPS.'),
    ).toBeTruthy();
    expect(mocks.addProviderInstance).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('tracks structured validation failures and increments retries', async () => {
    mocks.addProviderInstance
      .mockResolvedValueOnce({ success: false, error: 'raw backend secret' })
      .mockResolvedValueOnce({ success: true, discoveredModels: [] });
    const nextAttempt = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(2);
    const callbacks = renderConnectionView(nextAttempt);

    await connectWithSecret();
    await waitFor(() =>
      expect(screen.getByText('raw backend secret')).toBeTruthy(),
    );
    fireEvent.change(screen.getByPlaceholderText('Enter API key...'), {
      target: { value: 'sk-second-secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(callbacks.onBack).toHaveBeenCalledOnce());
    expect(mocks.track).toHaveBeenCalledWith(
      'onboarding-provider-connect-failed',
      expect.objectContaining({
        attempt_number: 1,
        failure_stage: 'credential-validation',
        error_kind: 'validation-error',
      }),
    );
    expect(mocks.track).toHaveBeenCalledWith(
      'onboarding-provider-connected',
      expect.objectContaining({ attempt_number: 2 }),
    );
    const serializedTelemetry = JSON.stringify(mocks.track.mock.calls);
    expect(serializedTelemetry).not.toContain('raw backend secret');
    expect(serializedTelemetry).not.toContain('sk-second-secret');
  });

  it('tracks RPC exceptions without leaking raw errors', async () => {
    mocks.addProviderInstance.mockRejectedValue(
      new Error('network failed with sensitive URL'),
    );
    const callbacks = renderConnectionView();

    await connectWithSecret();

    await waitFor(() =>
      expect(
        screen.getByText('Connection failed. Please try again.'),
      ).toBeTruthy(),
    );
    expect(mocks.track).toHaveBeenCalledWith(
      'onboarding-provider-connect-failed',
      expect.objectContaining({
        failure_stage: 'rpc',
        error_kind: 'unknown-error',
      }),
    );
    expect(callbacks.onConnectionResult).toHaveBeenCalledWith({
      entry: ENTRY,
      success: false,
    });
    expect(JSON.stringify(mocks.track.mock.calls)).not.toContain(
      'network failed with sensitive URL',
    );
  });
});
