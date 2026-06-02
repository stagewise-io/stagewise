import { describe, expect, it } from 'vitest';
import { isUIEventName, parseUIEventProperties } from './telemetry';

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
});

describe('auth UI telemetry schemas', () => {
  it('registers all social auth UI event names', () => {
    for (const eventName of SOCIAL_AUTH_EVENTS) {
      expect(isUIEventName(eventName)).toBe(true);
    }
  });

  it('accepts Google and GitHub as social providers', () => {
    for (const eventName of SOCIAL_AUTH_EVENTS) {
      expect(parseUIEventProperties(eventName, { provider: 'google' })).toEqual(
        {
          provider: 'google',
        },
      );
      expect(parseUIEventProperties(eventName, { provider: 'github' })).toEqual(
        {
          provider: 'github',
        },
      );
    }
  });

  it('rejects non-social providers for social auth events', () => {
    for (const eventName of SOCIAL_AUTH_EVENTS) {
      expect(
        parseUIEventProperties(eventName, { provider: 'openai' }),
      ).toBeNull();
      expect(parseUIEventProperties(eventName, {})).toBeNull();
    }
  });

  it('accepts OTP requested and verified events without properties', () => {
    for (const eventName of OTP_AUTH_EVENTS) {
      expect(parseUIEventProperties(eventName, undefined)).toBeUndefined();
    }
  });

  it('rejects unexpected properties for OTP requested and verified events', () => {
    for (const eventName of OTP_AUTH_EVENTS) {
      expect(
        parseUIEventProperties(eventName, { provider: 'google' }),
      ).toBeNull();
    }
  });

  it('validates OTP failure kinds', () => {
    for (const eventName of OTP_FAILURE_EVENTS) {
      expect(
        parseUIEventProperties(eventName, { error_kind: 'backend-error' }),
      ).toEqual({ error_kind: 'backend-error' });
      expect(
        parseUIEventProperties(eventName, {
          error_kind: 'turnstile-not-ready',
        }),
      ).toEqual({ error_kind: 'turnstile-not-ready' });
      expect(
        parseUIEventProperties(eventName, { error_kind: 'validation-error' }),
      ).toBeNull();
    }
  });

  it('validates account and chat auth method failure metadata', () => {
    for (const eventName of METHOD_FAILURE_EVENTS) {
      expect(
        parseUIEventProperties(eventName, {
          auth_method: 'stagewise',
          provider: 'google',
          error_kind: 'network-error',
        }),
      ).toEqual({
        auth_method: 'stagewise',
        provider: 'google',
        error_kind: 'network-error',
      });
      expect(
        parseUIEventProperties(eventName, {
          auth_method: 'stagewise',
          error_kind: 'validation-error',
        }),
      ).toEqual({
        auth_method: 'stagewise',
        error_kind: 'validation-error',
      });
      expect(
        parseUIEventProperties(eventName, {
          auth_method: 'api-keys',
          provider: 'google',
          error_kind: 'network-error',
        }),
      ).toBeNull();
      expect(
        parseUIEventProperties(eventName, {
          auth_method: 'stagewise',
          provider: 'anthropic',
          error_kind: 'network-error',
        }),
      ).toBeNull();
    }
  });

  it('accepts model and social providers for onboarding method failures', () => {
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
    ).toEqual({
      auth_method: 'stagewise',
      provider: 'github',
      error_kind: 'backend-error',
    });
    expect(
      parseUIEventProperties('onboarding-auth-method-failed', {
        auth_method: 'stagewise',
        provider: 'not-a-provider',
        error_kind: 'backend-error',
      }),
    ).toBeNull();
  });
});
