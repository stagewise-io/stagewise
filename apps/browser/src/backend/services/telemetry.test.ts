import { describe, expect, it } from 'vitest';
import type {
  KartonContract,
  OnboardingCompletionSummary,
} from '@shared/karton-contracts/ui';
import { isUIEventName, parseUIEventProperties } from './telemetry';

type Assert<T extends true> = T;
type IsExact<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;
type OnboardingCompletionInput = Exclude<
  Parameters<
    KartonContract['serverProcedures']['userExperience']['setHasSeenOnboardingFlow']
  >[0],
  boolean
>;
type _OnboardingSummaryContract = Assert<
  IsExact<
    NonNullable<OnboardingCompletionInput['summary']>,
    OnboardingCompletionSummary
  >
>;

const ONBOARDING_COMPLETION_SUMMARY: OnboardingCompletionSummary = {
  onboarding_run_id: 'run-1',
  total_duration_ms: 100,
  connected_provider_keys: ['openai-api'],
  connected_provider_count: 1,
  provider_step_skipped: false,
  personalization_changed: true,
};

const SOCIAL_AUTH_EVENTS = [
  'onboarding-auth-social-requested',
  'onboarding-auth-social-verified',
  'account-auth-social-requested',
  'account-auth-social-verified',
  'chat-auth-social-requested',
  'chat-auth-social-verified',
] as const;

const OTP_AUTH_EVENTS = [
  'onboarding-auth-otp-requested',
  'onboarding-auth-otp-verified',
  'account-auth-otp-requested',
  'account-auth-otp-verified',
  'chat-auth-otp-requested',
  'chat-auth-otp-verified',
] as const;

const OTP_FAILURE_EVENTS = [
  'onboarding-auth-otp-failed',
  'account-auth-otp-failed',
  'chat-auth-otp-failed',
] as const;

const METHOD_FAILURE_EVENTS = [
  'account-auth-method-failed',
  'chat-auth-method-failed',
] as const;

const EMAIL_HANDOFF_EVENTS = [
  'onboarding-auth-email-handoff-requested',
  'onboarding-auth-email-handoff-verified',
  'account-auth-email-handoff-requested',
  'account-auth-email-handoff-verified',
  'chat-auth-email-handoff-requested',
  'chat-auth-email-handoff-verified',
] as const;

const ONBOARDING_EVENTS = [
  'onboarding-started',
  'onboarding-step-viewed',
  'onboarding-step-exited',
  'onboarding-auth-skipped',
  'onboarding-provider-detail-viewed',
  'onboarding-provider-connect-attempted',
  'onboarding-provider-connected',
  'onboarding-provider-connect-failed',
  'onboarding-provider-step-completed',
] as const;

const PROVIDER_IDENTITY = {
  provider_key: 'openai-api',
  provider_type: 'openai-api',
  provider_kind: 'vendor-api',
} as const;

describe('main UI telemetry schemas', () => {
  it('registers and validates closed-lid sleep toggle events', () => {
    expect(isUIEventName('closed-lid-sleep-toggled')).toBe(true);
    expect(
      parseUIEventProperties('closed-lid-sleep-toggled', { enabled: true }),
    ).toEqual({ enabled: true });

    expect(
      parseUIEventProperties('closed-lid-sleep-toggled', { enabled: false }),
    ).toEqual({ enabled: false });
    expect(
      parseUIEventProperties('closed-lid-sleep-toggled', { enabled: 'true' }),
    ).toBeNull();
  });

  it('validates custom-model telemetry payloads', () => {
    expect(
      parseUIEventProperties('custom-model-add-started', {
        initial_provider_type: 'custom-openai-chat',
      }),
    ).toEqual({ initial_provider_type: 'custom-openai-chat' });
    expect(
      parseUIEventProperties('custom-model-add-finished', {
        provider_type: 'custom-openai-chat',
      }),
    ).toEqual({ provider_type: 'custom-openai-chat' });
    expect(
      parseUIEventProperties('custom-model-add-finished', {
        model_id: 'private-model',
        provider_type: 'custom-openai-chat',
      }),
    ).toEqual({
      model_id: 'private-model',
      provider_type: 'custom-openai-chat',
    });
    expect(
      parseUIEventProperties('custom-model-add-started', {
        provider_type: 'custom-openai-chat',
      }),
    ).toBeNull();
  });

  it('accepts omitted and diagnostic custom-provider abort payloads', () => {
    expect(
      parseUIEventProperties('custom-provider-add-aborted', undefined),
    ).toBeUndefined();
    expect(
      parseUIEventProperties('custom-provider-add-aborted', {
        had_validation_errors: false,
        any_field_touched: true,
        api_spec: 'openai',
      }),
    ).toEqual({
      had_validation_errors: false,
      any_field_touched: true,
      api_spec: 'openai',
    });
    expect(
      parseUIEventProperties('custom-provider-add-aborted', {
        had_validation_errors: false,
        any_field_touched: true,
      }),
    ).toBeNull();
    expect(
      parseUIEventProperties('custom-provider-add-aborted', {
        had_validation_errors: false,
        any_field_touched: true,
        api_spec: 'openai',
        api_key: 'secret',
      }),
    ).toBeNull();
  });

  it('accepts every emitted new-agent source and sound loudness value', () => {
    for (const source of [
      'sidebar-top',
      'sidebar-active-agents',
      'sidebar-workspace-group',
      'collapsed-titlebar',
      'hotkey',
    ] as const) {
      expect(
        parseUIEventProperties('chat-new-agent-clicked', { source }),
      ).toEqual({ source });
    }

    for (const loudness of ['off', 'subtle', 'default'] as const) {
      expect(
        parseUIEventProperties('changed-notification-sound-loudness', {
          loudness,
        }),
      ).toEqual({ loudness });
    }

    expect(
      parseUIEventProperties('chat-new-agent-clicked', { source: 'unknown' }),
    ).toBeNull();
    expect(
      parseUIEventProperties('changed-notification-sound-loudness', {
        loudness: 'loud',
      }),
    ).toBeNull();
  });
});

describe('onboarding funnel telemetry schemas', () => {
  it('uses the shared onboarding completion summary contract', () => {
    expect(ONBOARDING_COMPLETION_SUMMARY.connected_provider_count).toBe(1);
  });
  it('registers every funnel event and preserves valid payloads', () => {
    for (const eventName of ONBOARDING_EVENTS) {
      expect(isUIEventName(eventName)).toBe(true);
    }

    const cases = [
      [
        'onboarding-started',
        {
          onboarding_run_id: 'run-1',
          connected_provider_count: 0,
        },
      ],
      [
        'onboarding-step-viewed',
        {
          onboarding_run_id: 'run-1',
          step: 'configure-skills',
          previous_step: 'configure-providers',
          visit_index: 1,
          elapsed_ms_since_start: 12.5,
        },
      ],
      [
        'onboarding-step-exited',
        {
          onboarding_run_id: 'run-1',
          step: 'configure-providers',
          destination: 'personalization',
          action: 'next',
          duration_ms: 30,
        },
      ],
      ['onboarding-auth-skipped', { onboarding_run_id: 'run-1' }],
      [
        'onboarding-provider-detail-viewed',
        {
          onboarding_run_id: 'run-1',
          ...PROVIDER_IDENTITY,
          position: 0,
          search_active: true,
          already_connected: false,
        },
      ],
      [
        'onboarding-provider-connect-attempted',
        {
          onboarding_run_id: 'run-1',
          ...PROVIDER_IDENTITY,
          attempt_number: 1,
        },
      ],
      [
        'onboarding-provider-connected',
        {
          onboarding_run_id: 'run-1',
          ...PROVIDER_IDENTITY,
          attempt_number: 1,
          duration_ms: 50,
          discovered_model_count: 4,
        },
      ],
      [
        'onboarding-provider-connect-failed',
        {
          onboarding_run_id: 'run-1',
          ...PROVIDER_IDENTITY,
          attempt_number: 2,
          duration_ms: 25,
          failure_stage: 'rpc',
          error_kind: 'network-error',
        },
      ],
      [
        'onboarding-provider-step-completed',
        {
          onboarding_run_id: 'run-1',
          duration_ms: 100,
          connected_provider_count: 1,
          connected_during_step_count: 1,
          connected_provider_keys: ['openai-api'],
          viewed_provider_count: 1,
          connection_attempt_count: 2,
          connection_failure_count: 1,
          search_used: true,
          skipped_without_provider: false,
        },
      ],
    ] as const;

    for (const [eventName, properties] of cases) {
      expect(parseUIEventProperties(eventName, properties)).toEqual(properties);
    }
  });

  it('rejects unknown or sensitive properties and invalid values', () => {
    expect(
      parseUIEventProperties('onboarding-provider-connect-attempted', {
        onboarding_run_id: 'run-1',
        ...PROVIDER_IDENTITY,
        attempt_number: 1,
        api_key: 'secret',
      }),
    ).toBeNull();
    expect(
      parseUIEventProperties('onboarding-provider-connect-failed', {
        onboarding_run_id: 'run-1',
        ...PROVIDER_IDENTITY,
        attempt_number: 1,
        duration_ms: 1,
        failure_stage: 'backend-message',
        error_kind: 'raw-error',
      }),
    ).toBeNull();
    expect(
      parseUIEventProperties('onboarding-step-exited', {
        onboarding_run_id: 'run-1',
        step: 'personalization',
        destination: 'configure-providers',
        action: 'abandon',
        duration_ms: -1,
      }),
    ).toBeNull();
    expect(
      parseUIEventProperties('onboarding-provider-connected', {
        onboarding_run_id: 'run-1',
        ...PROVIDER_IDENTITY,
        attempt_number: 0,
        duration_ms: Number.POSITIVE_INFINITY,
        discovered_model_count: -1,
      }),
    ).toBeNull();
  });
});

describe('retired account telemetry', () => {
  it('does not register retired account event names', () => {
    for (const eventName of [
      ...SOCIAL_AUTH_EVENTS,
      ...OTP_AUTH_EVENTS,
      ...OTP_FAILURE_EVENTS,
      ...METHOD_FAILURE_EVENTS,
      ...EMAIL_HANDOFF_EVENTS,
    ]) {
      expect(isUIEventName(eventName)).toBe(false);
    }
  });

  it('accepts external providers and rejects retired account methods', () => {
    expect(
      parseUIEventProperties('onboarding-auth-method-failed', {
        auth_method: 'api-keys',
        provider: 'openai',
        error_kind: 'backend-error',
      }),
    ).toEqual({
      auth_method: 'api-keys',
      provider: 'openai',
      error_kind: 'backend-error',
    });
    expect(
      parseUIEventProperties('onboarding-auth-method-failed', {
        auth_method: 'stagewise',
        provider: 'github',
        error_kind: 'backend-error',
      }),
    ).toBeNull();
    expect(
      parseUIEventProperties('onboarding-auth-method-failed', {
        auth_method: 'stagewise',
        provider: 'email',
        error_kind: 'backend-error',
      }),
    ).toBeNull();
    expect(
      parseUIEventProperties('onboarding-auth-method-failed', {
        auth_method: 'stagewise',
        provider: 'not-a-provider',
        error_kind: 'backend-error',
      }),
    ).toBeNull();
  });
});
