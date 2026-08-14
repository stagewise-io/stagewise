import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AppState } from '@shared/karton-contracts/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  setHasSeenOnboardingFlow: vi.fn(),
  updatePreferences: vi.fn(),
  markCurrentReleaseNotesSeen: vi.fn(),
  state: {
    userAccount: { status: 'unauthenticated' },
    preferences: {
      providerInstances: [] as unknown[],
      agent: { enabledGlobalSkillDirs: [] as string[] },
    },
    globalSkills: [] as AppState['globalSkills'],
  },
}));

vi.mock('@ui/hooks/use-track', () => ({ useTrack: () => mocks.track }));
vi.mock('@ui/components/release-notes', () => ({
  markCurrentReleaseNotesSeen: mocks.markCurrentReleaseNotesSeen,
}));
vi.mock('@ui/hooks/use-karton', () => ({
  useKartonState: vi.fn((selector) => selector(mocks.state)),
  useKartonProcedure: vi.fn((selector) =>
    selector({
      userExperience: {
        setHasSeenOnboardingFlow: mocks.setHasSeenOnboardingFlow,
      },
      preferences: { update: mocks.updatePreferences },
    }),
  ),
}));
vi.mock('./steps/01-login', () => ({
  StepLogin: ({ onSkip, onAuthenticated }: any) => (
    <div>
      <button type="button" onClick={onSkip}>
        Skip login
      </button>
      <button
        type="button"
        onClick={() => onAuthenticated({ auth_method: 'stagewise' })}
      >
        Authenticate
      </button>
    </div>
  ),
}));
vi.mock('./steps/06-configure-providers', () => ({
  StepConfigureProviders: ({ onNext, onBack, onSummary }: any) => (
    <div>
      <button type="button" onClick={onBack}>
        Provider back
      </button>
      <button
        type="button"
        onClick={() => {
          onSummary({
            connected_provider_count: 1,
            connected_provider_keys: ['openai-api'],
            provider_step_skipped: false,
          });
          onNext();
        }}
      >
        Provider next
      </button>
      <button
        type="button"
        onClick={() => {
          onSummary({
            connected_provider_count: 1,
            connected_provider_keys: ['openai-api'],
            provider_step_skipped: true,
          });
          onNext();
        }}
      >
        Provider next skipped
      </button>
    </div>
  ),
}));
vi.mock('./steps/07-theme', () => ({
  StepTheme: ({ onNext, onBack, onPersonalizationChanged }: any) => (
    <div>
      <button type="button" onClick={onBack}>
        Theme back
      </button>
      <button type="button" onClick={onPersonalizationChanged}>
        Change theme
      </button>
      <button type="button" onClick={onNext}>
        Finish
      </button>
    </div>
  ),
}));
import { OnboardingWizard } from './index';

function callsFor(eventName: string) {
  return mocks.track.mock.calls.filter(([name]) => name === eventName);
}

describe('OnboardingWizard', () => {
  beforeEach(() => {
    mocks.track.mockReset();
    mocks.track.mockResolvedValue(undefined);
    mocks.setHasSeenOnboardingFlow.mockReset();
    mocks.updatePreferences.mockReset();
    mocks.updatePreferences.mockResolvedValue(undefined);
    mocks.markCurrentReleaseNotesSeen.mockReset();
    mocks.state.userAccount.status = 'unauthenticated';
    mocks.state.preferences.providerInstances = [];
    mocks.state.globalSkills = [];
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001',
    );
  });

  it('emits one view per logical navigation and classifies skip/back', async () => {
    render(<OnboardingWizard />);

    await waitFor(() => expect(callsFor('onboarding-started')).toHaveLength(1));
    expect(callsFor('onboarding-step-viewed')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Skip login' }));
    await screen.findByRole('button', { name: 'Provider back' });
    fireEvent.click(screen.getByRole('button', { name: 'Provider back' }));
    await screen.findByRole('button', { name: 'Skip login' });

    await waitFor(() =>
      expect(callsFor('onboarding-step-viewed')).toHaveLength(3),
    );
    expect(callsFor('onboarding-started')).toHaveLength(1);
    expect(callsFor('onboarding-step-exited')).toEqual([
      [
        'onboarding-step-exited',
        expect.objectContaining({
          step: 'login',
          destination: 'configure-providers',
          action: 'skip',
        }),
      ],
      [
        'onboarding-step-exited',
        expect.objectContaining({
          step: 'configure-providers',
          destination: 'login',
          action: 'back',
        }),
      ],
    ]);
  });

  it('keeps onboarding-started as one immutable start snapshot', async () => {
    const { rerender } = render(<OnboardingWizard />);

    await waitFor(() => expect(callsFor('onboarding-started')).toHaveLength(1));
    const initialCall = callsFor('onboarding-started')[0];

    mocks.state.userAccount.status = 'authenticated';
    mocks.state.preferences.providerInstances = [
      { id: 'provider-1', typeId: 'openai-api', config: {} },
    ];
    rerender(<OnboardingWizard />);

    expect(callsFor('onboarding-started')).toEqual([initialCall]);
    expect(initialCall).toEqual([
      'onboarding-started',
      expect.objectContaining({
        already_authenticated: false,
        connected_provider_count: 0,
      }),
    ]);
  });

  it('passes the final aggregate summary to durable completion', async () => {
    render(<OnboardingWizard />);
    await screen.findByRole('button', { name: 'Authenticate' });

    fireEvent.click(screen.getByRole('button', { name: 'Authenticate' }));
    await screen.findByRole('button', { name: 'Provider next' });
    fireEvent.click(screen.getByRole('button', { name: 'Provider next' }));
    await screen.findByRole('button', { name: 'Change theme' });
    fireEvent.click(screen.getByRole('button', { name: 'Change theme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(mocks.markCurrentReleaseNotesSeen).toHaveBeenCalledOnce();
    expect(mocks.setHasSeenOnboardingFlow).toHaveBeenCalledOnce();
    expect(
      mocks.markCurrentReleaseNotesSeen.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.setHasSeenOnboardingFlow.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.setHasSeenOnboardingFlow).toHaveBeenCalledWith({
      value: true,
      auth: { auth_method: 'stagewise' },
      summary: expect.objectContaining({
        onboarding_run_id: '00000000-0000-4000-8000-000000000001',
        connected_provider_keys: ['openai-api'],
        connected_provider_count: 1,
        provider_step_skipped: false,
        personalization_changed: true,
      }),
    });
    expect(callsFor('onboarding-step-exited').at(-1)).toEqual([
      'onboarding-step-exited',
      expect.objectContaining({
        step: 'personalization',
        destination: 'completed',
        action: 'finish',
      }),
    ]);
  });

  it('preserves a provider connection across repeated step visits', async () => {
    render(<OnboardingWizard />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Authenticate' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Provider next' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Theme back' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Provider next skipped' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Finish' }));

    expect(mocks.setHasSeenOnboardingFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: expect.objectContaining({
          connected_provider_count: 1,
          connected_provider_keys: ['openai-api'],
          provider_step_skipped: false,
        }),
      }),
    );
  });

  it('preserves run-local skip attribution with existing providers', async () => {
    mocks.state.preferences.providerInstances = [
      { id: 'existing', typeId: 'openai-api', config: {} },
    ];
    render(<OnboardingWizard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Skip login' }));
    await screen.findByRole('button', { name: 'Provider next skipped' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Provider next skipped' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Finish' }));

    expect(mocks.setHasSeenOnboardingFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: expect.objectContaining({
          connected_provider_count: 1,
          connected_provider_keys: ['openai-api'],
          provider_step_skipped: true,
        }),
      }),
    );
  });

  it('routes through skill configuration when external skills are detected', async () => {
    mocks.state.globalSkills = [
      {
        name: 'review',
        description: 'Review code',
        mountPrefix: 'globalskills-codex',
      },
    ];
    render(<OnboardingWizard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Skip login' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Provider next skipped' }),
    );
    expect(await screen.findByText('Use your existing skills')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Theme back' }));

    expect(await screen.findByText('Use your existing skills')).toBeTruthy();
  });
});
