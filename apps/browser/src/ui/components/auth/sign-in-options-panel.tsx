import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import { InputOtp } from '@stagewise/stage-ui/components/input-otp';
import { useTurnstile } from '@ui/hooks/use-turnstile';
import { GithubMark } from '@ui/components/icons/github-mark';
import { GoogleLogo } from '@ui/components/provider-logos/google';
import { ProviderLogo } from '@ui/components/provider-logos';
import { IconEnvelopeOutline18, IconKey2Outline18 } from 'nucleo-ui-outline-18';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@stagewise/stage-ui/lib/utils';
import type { SocialAuthProvider } from '@shared/karton-contracts/ui/shared-types';
export type SignInMethod = SocialAuthProvider | 'email';

type AuthPhase = 'options' | 'email' | 'otp';
type TrackingPrefix = 'onboarding-auth' | 'account-auth' | 'chat-auth';
type TrackEvent = (
  eventName: string,
  properties?: Record<string, unknown>,
) => void | Promise<void>;

// This component is shared by both Electron renderer hosts: the main UI
// preload exposes `window.electron`, while internal pages expose
// `window.stagewisePagesApi`. Keep host-bound services injected through props
// and avoid importing Karton/telemetry hooks here.
export type SignInOptionsPanelProps = {
  title?: string;
  description?: string;
  variant?: 'centered' | 'section';
  sendOtp: (
    email: string,
    turnstileToken?: string,
  ) => Promise<{ error?: string }>;
  verifyOtp: (email: string, code: string) => Promise<{ error?: string }>;
  signInSocial: (provider: SocialAuthProvider) => Promise<{ error?: string }>;
  onUseApiKeys: () => void;
  onUseSubscription: () => void;
  trackingPrefix: TrackingPrefix;
  track: TrackEvent;
  onAuthenticated?: (method: SignInMethod) => void;
  className?: string;
};

const LAST_USED_SIGN_IN_METHOD_KEY = 'stagewise:last-used-sign-in-method';

function LastUsedBadge() {
  return (
    <span className="absolute -top-2 right-2 rounded-full border border-derived-lighter-subtle bg-primary-solid px-2 py-0.5 font-medium text-[10px] text-solid-foreground leading-none shadow-elevation-1">
      Last used
    </span>
  );
}

const CODING_PLAN_LOGO_PROVIDERS = [
  'z-ai',
  'moonshotai',
  'alibaba',
  'minimax',
] as const;

function CodingPlanLogoStack() {
  const providers = CODING_PLAN_LOGO_PROVIDERS;
  const [providerIndex, setProviderIndex] = useState(0);
  const provider = providers[providerIndex] ?? providers[0];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProviderIndex((index) => (index + 1) % providers.length);
    }, 1800);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <span
      key={provider}
      className="relative flex size-5 items-center justify-center rounded-full text-foreground"
      aria-hidden
    >
      <span className="absolute size-4 animate-[coding-plan-ink-pulse_350ms_cubic-bezier(0.16,1,0.3,1)] rounded-full bg-foreground/10 opacity-0" />
      <ProviderLogo
        provider={provider}
        className="relative size-4 animate-[coding-plan-logo-swap_350ms_cubic-bezier(0.16,1,0.3,1)]"
      />
      <style>{`
        @keyframes coding-plan-logo-swap {
          0% { opacity: 0; filter: blur(4px); transform: scale(0.88) translateY(2px); }
          100% { opacity: 1; filter: blur(0); transform: scale(1) translateY(0); }
        }

        @keyframes coding-plan-ink-pulse {
          0% { opacity: 0.18; transform: scale(0.45); }
          45% { opacity: 0.28; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.55); }
        }
      `}</style>
    </span>
  );
}

export function SignInOptionsPanel({
  title = 'Authenticate',
  description = 'Choose a sign-in method to continue.',
  variant = 'centered',
  sendOtp,
  verifyOtp,
  signInSocial,
  onUseApiKeys,
  onUseSubscription,
  trackingPrefix,
  track,
  onAuthenticated,
  className,
}: SignInOptionsPanelProps) {
  const [phase, setPhase] = useState<AuthPhase>('options');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialAuthProvider | null>(
    null,
  );
  const [lastUsedMethod, setLastUsedMethod] = useState<SignInMethod | null>(
    null,
  );
  const pendingSocialAuth = !!socialLoading;
  const emailRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const {
    containerRef: turnstileRef,
    token: turnstileToken,
    ready: turnstileReady,
    error: turnstileError,
    enabled: turnstileEnabled,
    reset: resetTurnstile,
  } = useTurnstile();

  useEffect(() => {
    let storedMethod: string | null = null;
    try {
      storedMethod = window.localStorage.getItem(LAST_USED_SIGN_IN_METHOD_KEY);
    } catch {}
    if (
      storedMethod === 'google' ||
      storedMethod === 'github' ||
      storedMethod === 'email'
    ) {
      setLastUsedMethod(storedMethod);
    }
  }, []);

  useEffect(() => {
    if (phase === 'email') emailRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase === 'otp') otpRef.current?.focus();
  }, [phase]);

  const rememberSignInMethod = useCallback((method: SignInMethod) => {
    setLastUsedMethod(method);
    try {
      window.localStorage.setItem(LAST_USED_SIGN_IN_METHOD_KEY, method);
    } catch {}
  }, []);

  const clearRememberedSignInMethod = useCallback(() => {
    setLastUsedMethod(null);
    try {
      window.localStorage.removeItem(LAST_USED_SIGN_IN_METHOD_KEY);
    } catch {}
  }, []);

  const handleSocialSignIn = useCallback(
    async (provider: SocialAuthProvider) => {
      if (loading || socialLoading) return;
      setError(null);
      setSocialLoading(provider);
      rememberSignInMethod(provider);
      void track(`${trackingPrefix}-social-requested`, { provider });
      try {
        const result = await signInSocial(provider);
        if (result?.error) {
          void track(`${trackingPrefix}-method-failed`, {
            auth_method: 'stagewise',
            provider,
            error_kind: 'backend-error',
          });
          clearRememberedSignInMethod();
          setError(result.error);
          return;
        }
        void track(`${trackingPrefix}-social-verified`, { provider });
        onAuthenticated?.(provider);
      } catch {
        void track(`${trackingPrefix}-method-failed`, {
          auth_method: 'stagewise',
          provider,
          error_kind: 'network-error',
        });
        clearRememberedSignInMethod();
        setError('Failed to complete social sign-in.');
      } finally {
        setSocialLoading(null);
      }
    },
    [
      clearRememberedSignInMethod,
      loading,
      onAuthenticated,
      rememberSignInMethod,
      signInSocial,
      socialLoading,
      track,
      trackingPrefix,
    ],
  );

  const handleSendOtp = useCallback(async () => {
    if (!email.trim()) return;
    if (turnstileEnabled && !turnstileToken && !turnstileError) {
      void track(`${trackingPrefix}-otp-failed`, {
        error_kind: 'turnstile-not-ready',
      });
      setError('Security verification not ready. Please wait a moment.');
      return;
    }
    void track(`${trackingPrefix}-otp-requested`);
    setError(null);
    setLoading(true);
    try {
      const result = await sendOtp(email.trim(), turnstileToken ?? '');
      if (result?.error) {
        void track(`${trackingPrefix}-otp-failed`, {
          error_kind: 'backend-error',
        });
        setError(result.error);
        resetTurnstile();
      } else {
        setPhase('otp');
      }
    } catch {
      void track(`${trackingPrefix}-otp-failed`, {
        error_kind: 'network-error',
      });
      setError('Failed to send verification code.');
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  }, [
    email,
    resetTurnstile,
    sendOtp,
    track,
    trackingPrefix,
    turnstileEnabled,
    turnstileError,
    turnstileToken,
  ]);

  const handleVerifyOtp = useCallback(async () => {
    if (!code.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const result = await verifyOtp(email.trim(), code.trim());
      if (result?.error) {
        void track(`${trackingPrefix}-otp-failed`, {
          error_kind: 'backend-error',
        });
        void track(`${trackingPrefix}-method-failed`, {
          auth_method: 'stagewise',
          error_kind: 'validation-error',
        });
        setError(result.error);
      } else {
        void track(`${trackingPrefix}-otp-verified`);
        rememberSignInMethod('email');
        onAuthenticated?.('email');
      }
    } catch {
      void track(`${trackingPrefix}-otp-failed`, {
        error_kind: 'network-error',
      });
      void track(`${trackingPrefix}-method-failed`, {
        auth_method: 'stagewise',
        error_kind: 'network-error',
      });
      setError('Failed to verify code.');
    } finally {
      setLoading(false);
    }
  }, [
    code,
    email,
    onAuthenticated,
    rememberSignInMethod,
    track,
    trackingPrefix,
    verifyOtp,
  ]);

  const headerDescription =
    phase === 'email'
      ? 'Enter your email to receive a verification code.'
      : phase === 'otp'
        ? `We sent a code to ${email}. Enter it below.`
        : description;

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-4',
        variant === 'centered' && 'items-center text-center',
        className,
      )}
    >
      {(title || headerDescription) && (
        <div
          className={cn(
            'flex flex-col gap-2',
            variant === 'centered' && 'items-center',
          )}
        >
          {title && (
            <h2 className="font-medium text-foreground text-xl">{title}</h2>
          )}
          {headerDescription && (
            <p className="text-muted-foreground text-sm">
              {phase === 'otp' ? (
                <>
                  We sent a code to{' '}
                  <span className="font-semibold text-muted-foreground">
                    {email}
                  </span>
                  . Enter it below.
                </>
              ) : (
                headerDescription
              )}
            </p>
          )}
        </div>
      )}

      <div ref={turnstileRef} className="empty:hidden" />

      {phase === 'options' && (
        <div className="app-no-drag flex w-full max-w-sm flex-col gap-4">
          <div className="grid gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="relative w-full overflow-visible"
              onClick={() => void handleSocialSignIn('google')}
              disabled={loading || !!socialLoading}
            >
              {lastUsedMethod === 'google' && <LastUsedBadge />}
              <GoogleLogo className="size-4" aria-hidden />
              {socialLoading === 'google'
                ? 'Opening Google…'
                : 'Continue with Google'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="relative w-full overflow-visible"
              onClick={() => void handleSocialSignIn('github')}
              disabled={loading || !!socialLoading}
            >
              {lastUsedMethod === 'github' && <LastUsedBadge />}
              <GithubMark className="size-4" aria-hidden="true" />
              {socialLoading === 'github'
                ? 'Opening GitHub…'
                : 'Continue with GitHub'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="relative w-full overflow-visible"
              onClick={() => {
                if (pendingSocialAuth) return;
                setPhase('email');
                setError(null);
              }}
              disabled={pendingSocialAuth}
            >
              {lastUsedMethod === 'email' && <LastUsedBadge />}
              <IconEnvelopeOutline18 className="size-4" />
              Continue with Email
            </Button>
          </div>
          <div className="relative text-center text-subtle-foreground text-xs after:absolute after:inset-x-0 after:top-1/2 after:border-border-subtle after:border-t">
            <span className="relative z-10 bg-background px-2">or</span>
          </div>
          <div className="grid gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => {
                if (pendingSocialAuth) return;
                setError(null);
                onUseApiKeys();
              }}
              disabled={pendingSocialAuth}
            >
              <IconKey2Outline18 className="size-4" />
              Use your own API keys
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => {
                if (pendingSocialAuth) return;
                setError(null);
                onUseSubscription();
              }}
              disabled={pendingSocialAuth}
            >
              <CodingPlanLogoStack />
              Use existing subscription
            </Button>
          </div>
        </div>
      )}

      {phase === 'email' && (
        <div className="app-no-drag grid w-full max-w-sm gap-3">
          <Input
            ref={emailRef}
            placeholder="you@example.com"
            size="sm"
            className="w-full"
            type="email"
            value={email}
            onValueChange={(v) => setEmail(v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSendOtp();
            }}
            disabled={loading || !!socialLoading}
          />
          <Button
            variant="primary"
            className="relative w-full overflow-visible"
            size="sm"
            onClick={() => void handleSendOtp()}
            disabled={
              loading ||
              !!socialLoading ||
              !email.trim() ||
              (turnstileEnabled && !turnstileError && !turnstileToken)
            }
          >
            {lastUsedMethod === 'email' && <LastUsedBadge />}
            {turnstileEnabled && !turnstileReady && !turnstileError
              ? 'Loading...'
              : 'Send code'}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              if (loading) return;
              setPhase('options');
              setError(null);
              resetTurnstile();
            }}
            disabled={loading}
          >
            Back to sign-in options
          </Button>
        </div>
      )}

      {phase === 'otp' && (
        <div className="flex flex-col items-center gap-4">
          <InputOtp
            ref={otpRef}
            length={6}
            size={variant === 'centered' ? 'md' : 'sm'}
            value={code}
            onChange={(val) => setCode(val)}
            onComplete={() => void handleVerifyOtp()}
            disabled={loading}
            className="app-no-drag"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleVerifyOtp()}
            disabled={loading || code.length < 6}
          >
            {loading ? 'Verifying...' : 'Verify'}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              if (loading) return;
              setPhase('email');
              setCode('');
              setError(null);
              resetTurnstile();
            }}
            disabled={loading}
          >
            Use a different email
          </Button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="text-error-foreground text-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
