import { Button } from '@stagewise/stage-ui/components/button';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';
import { cn } from '@ui/utils';
import { Input } from '@stagewise/stage-ui/components/input';
import { InputOtp } from '@stagewise/stage-ui/components/input-otp';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { useTrack } from '@ui/hooks/use-track';
import { useTurnstile } from '@ui/hooks/use-turnstile';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { useIsTruncated } from '@ui/hooks/use-is-truncated';
import {
  CodingPlanCard,
  CODING_PLANS,
  type CodingPlanId,
} from '@ui/components/coding-plan-card';
import { ProviderLogo } from '@ui/components/provider-logos';
import {
  IconChevronLeftOutline18,
  IconChevronRightOutline18,
} from 'nucleo-ui-outline-18';
import type { StepValidityCallback } from '../index';
import type {
  ModelProvider,
  TelemetryLevel,
} from '@shared/karton-contracts/ui/shared-types';

type AuthMode = 'stagewise' | 'api-keys' | 'coding-plan';
type AuthPhase = 'form-input' | 'waiting-for-otp' | 'authentication-validated';
type ProviderKey =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'moonshotai'
  | 'alibaba'
  | 'deepseek'
  | 'z-ai';

const API_KEY_PROVIDERS: ProviderKey[] = [
  'anthropic',
  'openai',
  'google',
  'moonshotai',
  'alibaba',
  'deepseek',
  'z-ai',
];

type ConnectResult = { success: true } | { success: false; error: string };

export type OnboardingAuthCompletion = {
  auth_method: AuthMode;
  provider?: ModelProvider;
  plan_id?: CodingPlanId;
};

export function StepAuth({
  isActive,
  onValidityChange,
  onAuthCompleted,
}: {
  isActive: boolean;
  onStepComplete?: () => void;
  onValidityChange?: StepValidityCallback;
  onAuthCompleted?: (completion: OnboardingAuthCompletion) => void;
}) {
  const sendOtp = useKartonProcedure((p) => p.userAccount.sendOtp);
  const verifyOtp = useKartonProcedure((p) => p.userAccount.verifyOtp);
  const disconnectProvider = useKartonProcedure(
    (p) => p.preferences.disconnectProvider,
  );
  const connectCodingPlan = useKartonProcedure(
    (p) => p.preferences.connectCodingPlan,
  );
  const connectProvider = useKartonProcedure(
    (p) => p.preferences.connectProvider,
  );
  const preferencesUpdate = useKartonProcedure((p) => p.preferences.update);
  const openExternalUrl = useKartonProcedure((p) => p.openExternalUrl);
  const track = useTrack();
  const authStatus = useKartonState((s) => s.userAccount.status);
  const preferences = useKartonState((s) => s.preferences);
  const userEmail = useKartonState((s) =>
    s.userAccount.status === 'authenticated' ||
    s.userAccount.status === 'server_unreachable'
      ? s.userAccount.user?.email
      : null,
  );

  const [mode, setMode] = useState<AuthMode>('stagewise');
  const [phase, setPhase] = useState<AuthPhase>(
    authStatus === 'authenticated' || authStatus === 'server_unreachable'
      ? 'authentication-validated'
      : 'form-input',
  );
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // The anonymous telemetry toggle has been removed from onboarding.
  // Basic (anonymous) telemetry is enabled by default and is only opt-out
  // from the settings page. This state only governs the identifiable /
  // "full" telemetry upgrade checkbox shown below.
  const [telemetry, setTelemetry] = useState<TelemetryLevel>('anonymous');
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

  const [showMoreProviders, setShowMoreProviders] = useState(false);

  // API-keys list scroll fadeout — mirrors the models-list pattern in
  // agent-settings.models-providers.tsx.
  const [apiKeysViewport, setApiKeysViewport] = useState<HTMLElement | null>(
    null,
  );
  const apiKeysScrollRef = useRef<HTMLElement | null>(null);
  apiKeysScrollRef.current = apiKeysViewport;
  const { maskStyle: apiKeysMaskStyle } = useScrollFadeMask(apiKeysScrollRef, {
    axis: 'vertical',
    fadeDistance: 24,
  });

  useEffect(() => {
    if (isActive && mode === 'stagewise' && phase === 'form-input')
      requestAnimationFrame(() => emailRef.current?.focus());
  }, [isActive, mode, phase]);

  useEffect(() => {
    if (phase === 'waiting-for-otp') otpRef.current?.focus();
  }, [phase]);

  const hasConnectedApiKey = useMemo(() => {
    const cfgs = preferences.providerConfigs ?? {};
    return API_KEY_PROVIDERS.some(
      (p) => cfgs[p]?.mode === 'official' && !!cfgs[p]?.encryptedApiKey,
    );
  }, [preferences.providerConfigs]);

  const hasConnectedCodingPlan = useMemo(() => {
    const cfgs = preferences.providerConfigs ?? {};
    return Object.values(CODING_PLANS).some(
      (plan) =>
        cfgs[plan.provider]?.mode === 'official' &&
        !!cfgs[plan.provider]?.encryptedApiKey,
    );
  }, [preferences.providerConfigs]);

  const isValid =
    phase === 'authentication-validated' ||
    (mode === 'api-keys' && hasConnectedApiKey) ||
    (mode === 'coding-plan' && hasConnectedCodingPlan);

  const switchMode = useCallback(
    (to: AuthMode) => {
      setMode((from) => {
        if (from !== to) {
          void track('onboarding-auth-mode-switched', { from, to });
        }
        return to;
      });
    },
    [track],
  );

  useEffect(() => {
    if (
      authStatus === 'unauthenticated' &&
      phase === 'authentication-validated'
    ) {
      setPhase('form-input');
      switchMode('stagewise');
      setCode('');
      setError(null);
      setSelectedCodingPlanId(null);
    }
  }, [authStatus, phase, switchMode]);

  const trackAuthCompleted = useCallback(
    (completion: OnboardingAuthCompletion) => {
      void track('onboarding-auth-method-completed', completion);
      onAuthCompleted?.(completion);
    },
    [onAuthCompleted, track],
  );

  const handleConnectSingleKey = useCallback(
    async (provider: ProviderKey, apiKey: string): Promise<ConnectResult> => {
      try {
        const result = await connectProvider(provider, apiKey);
        if (result.success) {
          trackAuthCompleted({ auth_method: 'api-keys', provider });
        } else {
          void track('onboarding-auth-method-failed', {
            auth_method: 'api-keys',
            provider,
            error_kind: 'validation-error',
          });
        }
        return result;
      } catch (error) {
        void track('onboarding-auth-method-failed', {
          auth_method: 'api-keys',
          provider,
          error_kind: 'network-error',
        });
        throw error;
      }
    },
    [connectProvider, track, trackAuthCompleted],
  );

  const handleDisconnectApiKey = useCallback(
    async (provider: ProviderKey) => {
      await disconnectProvider(provider);
      void track('onboarding-auth-provider-disconnected', {
        auth_method: 'api-keys',
        provider,
      });
    },
    [disconnectProvider, track],
  );

  useEffect(() => {
    if (isActive) {
      onValidityChange?.(
        isValid,
        isValid ? undefined : 'Sign in or provide at least one provider key',
      );
    }
  }, [isActive, isValid, onValidityChange]);

  const handleSendOtp = useCallback(async () => {
    if (!email.trim()) return;
    if (turnstileEnabled && !turnstileToken && !turnstileError) {
      void track('onboarding-auth-otp-failed', {
        error_kind: 'turnstile-not-ready',
      });
      setError('Security verification not ready. Please wait a moment.');
      return;
    }
    void track('onboarding-auth-otp-requested');
    setError(null);
    setLoading(true);
    try {
      const result = await sendOtp(email.trim(), turnstileToken ?? '');
      if (result?.error) {
        void track('onboarding-auth-otp-failed', {
          error_kind: 'backend-error',
        });
        setError(result.error);
        resetTurnstile();
      } else {
        setPhase('waiting-for-otp');
      }
    } catch {
      void track('onboarding-auth-otp-failed', {
        error_kind: 'network-error',
      });
      setError('Failed to send verification code.');
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  }, [
    email,
    sendOtp,
    track,
    turnstileToken,
    turnstileEnabled,
    resetTurnstile,
    turnstileError,
  ]);

  const codingPlans = useMemo(() => Object.values(CODING_PLANS), []);

  // Sub-view state for the coding-plan mode. `null` = grid view,
  // otherwise the plan detail view for that id.
  const [selectedCodingPlanId, setSelectedCodingPlanId] =
    useState<CodingPlanId | null>(null);

  const handleConnectSinglePlan = useCallback(
    async (
      planId: CodingPlanId,
      apiKey: string,
    ): Promise<{ success: true } | { success: false; error: string }> => {
      const provider = CODING_PLANS[planId].provider;
      try {
        const result = await connectCodingPlan(planId, apiKey);
        if (result.success) {
          trackAuthCompleted({
            auth_method: 'coding-plan',
            provider,
            plan_id: planId,
          });
        } else {
          void track('onboarding-auth-method-failed', {
            auth_method: 'coding-plan',
            provider,
            plan_id: planId,
            error_kind: 'validation-error',
          });
        }
        return result;
      } catch (error) {
        void track('onboarding-auth-method-failed', {
          auth_method: 'coding-plan',
          provider,
          plan_id: planId,
          error_kind: 'network-error',
        });
        throw error;
      }
    },
    [connectCodingPlan, track, trackAuthCompleted],
  );

  const handleGetApiKey = useCallback(
    (url: string) => {
      void openExternalUrl(url);
    },
    [openExternalUrl],
  );

  const handleDisconnectPlan = useCallback(
    async (planId: CodingPlanId) => {
      const provider = CODING_PLANS[planId].provider;
      // Atomic: flips mode back to 'stagewise' AND clears the encrypted key
      // in a single patch update on the backend. No partial-state window.
      await disconnectProvider(provider);
      void track('onboarding-auth-provider-disconnected', {
        auth_method: 'coding-plan',
        provider,
        plan_id: planId,
      });
    },
    [disconnectProvider, track],
  );

  const handleVerifyOtp = useCallback(async () => {
    if (!code.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const result = await verifyOtp(email.trim(), code.trim());
      if (result?.error) {
        void track('onboarding-auth-otp-failed', {
          error_kind: 'backend-error',
        });
        void track('onboarding-auth-method-failed', {
          auth_method: 'stagewise',
          error_kind: 'validation-error',
        });
        setError(result.error);
      } else {
        void track('onboarding-auth-otp-verified');
        trackAuthCompleted({ auth_method: 'stagewise' });
        setPhase('authentication-validated');
      }
    } catch {
      void track('onboarding-auth-otp-failed', {
        error_kind: 'network-error',
      });
      void track('onboarding-auth-method-failed', {
        auth_method: 'stagewise',
        error_kind: 'network-error',
      });
      setError('Failed to verify code.');
    } finally {
      setLoading(false);
    }
  }, [email, code, verifyOtp, track, trackAuthCompleted]);

  if (phase === 'authentication-validated' && mode === 'stagewise') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2.5">
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-medium text-foreground text-xl">
            You&apos;re signed in as{' '}
            <span className="text-foreground">{userEmail}</span>
          </h1>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setPhase('form-input');
              setCode('');
              setError(null);
            }}
          >
            Use a different email
          </Button>
        </div>
        <div className="app-no-drag mt-2 flex items-center gap-2">
          <Checkbox
            size="xs"
            id="telemetry-full-checkbox"
            checked={telemetry === 'full'}
            onCheckedChange={(checked: boolean) => {
              setTelemetry(checked ? 'full' : 'anonymous');
              void preferencesUpdate([
                {
                  op: 'replace',
                  path: ['privacy', 'telemetryLevel'],
                  value: checked ? 'full' : 'anonymous',
                },
              ]);
            }}
          />
          <label
            htmlFor="telemetry-full-checkbox"
            className="text-muted-foreground text-xs"
          >
            Share identifiable chat and usage data with stagewise.
          </label>
        </div>
        <p className="mt-1 max-w-sm text-center text-[11px] text-muted-foreground/80">
          Basic telemetry is enabled by default and can be configured in
          settings.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      {!(mode === 'coding-plan' && selectedCodingPlanId !== null) && (
        <div className="flex flex-col items-center gap-2 pb-2">
          <h1 className="font-medium text-foreground text-xl">Authenticate</h1>
          {mode === 'stagewise' && phase === 'form-input' && (
            <p className="text-muted-foreground text-sm">
              Get access to the latest models with stagewise.
            </p>
          )}
          {mode === 'stagewise' && phase === 'waiting-for-otp' && (
            <p className="text-muted-foreground text-sm">
              We sent a code to{' '}
              <span className="font-semibold text-muted-foreground">
                {email}
              </span>
              . Enter it below.
            </p>
          )}
          {mode === 'api-keys' && (
            <p className="text-muted-foreground text-sm">
              Enter at least one provider key to authenticate.
            </p>
          )}
          {mode === 'coding-plan' && (
            <p className="text-muted-foreground text-sm">
              Connect a GLM, Kimi, Qwen, or MiniMax coding plan to authenticate.
            </p>
          )}
        </div>
      )}

      {/* Turnstile container — visible so interactive challenges can render */}
      <div ref={turnstileRef} />

      {mode === 'stagewise' && phase === 'form-input' && (
        <div className="flex gap-2">
          <Input
            ref={emailRef}
            placeholder="you@example.com"
            size="sm"
            className="app-no-drag w-64"
            type="email"
            value={email}
            onValueChange={(v) => setEmail(v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSendOtp();
            }}
            disabled={loading}
          />
          <Button
            variant="primary"
            className="shrink-0"
            size="sm"
            onClick={() => void handleSendOtp()}
            disabled={
              loading ||
              !email.trim() ||
              (turnstileEnabled && !turnstileError && !turnstileToken)
            }
          >
            {turnstileEnabled && !turnstileReady && !turnstileError
              ? 'Loading...'
              : 'Sign in'}
          </Button>
        </div>
      )}

      {mode === 'stagewise' && phase === 'waiting-for-otp' && (
        <div className="flex flex-col items-center gap-4">
          <InputOtp
            ref={otpRef}
            length={6}
            size="md"
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
              setPhase('form-input');
              setCode('');
              setError(null);
              resetTurnstile();
            }}
          >
            Use a different email
          </Button>
        </div>
      )}

      {mode === 'api-keys' && (
        <div className="app-no-drag flex w-full max-w-xs flex-col gap-3">
          <OverlayScrollbar
            className="mask-alpha max-h-96"
            style={apiKeysMaskStyle}
            onViewportRef={setApiKeysViewport}
            contentClassName="space-y-3"
          >
            <ApiKeyRow
              provider="anthropic"
              label="Anthropic"
              placeholder="sk-ant-api01..."
              autoFocus
              config={
                preferences.providerConfigs?.anthropic ?? { mode: 'stagewise' }
              }
              onConnect={handleConnectSingleKey}
              onDisconnect={handleDisconnectApiKey}
              onFocusProvider={(provider) => {
                void track('onboarding-auth-api-key-input-focused', {
                  provider,
                });
              }}
            />
            <ApiKeyRow
              provider="openai"
              label="OpenAI"
              placeholder="sk-proj-LW..."
              config={
                preferences.providerConfigs?.openai ?? { mode: 'stagewise' }
              }
              onConnect={handleConnectSingleKey}
              onDisconnect={handleDisconnectApiKey}
              onFocusProvider={(provider) => {
                void track('onboarding-auth-api-key-input-focused', {
                  provider,
                });
              }}
            />
            <ApiKeyRow
              provider="google"
              label="Google"
              placeholder="AIykSyLeD..."
              config={
                preferences.providerConfigs?.google ?? { mode: 'stagewise' }
              }
              onConnect={handleConnectSingleKey}
              onDisconnect={handleDisconnectApiKey}
              onFocusProvider={(provider) => {
                void track('onboarding-auth-api-key-input-focused', {
                  provider,
                });
              }}
            />
            {showMoreProviders && (
              <>
                <ApiKeyRow
                  provider="moonshotai"
                  label="Moonshot AI"
                  placeholder="sk-..."
                  config={
                    preferences.providerConfigs?.moonshotai ?? {
                      mode: 'stagewise',
                    }
                  }
                  onConnect={handleConnectSingleKey}
                  onDisconnect={handleDisconnectApiKey}
                  onFocusProvider={(provider) => {
                    void track('onboarding-auth-api-key-input-focused', {
                      provider,
                    });
                  }}
                />
                <ApiKeyRow
                  provider="alibaba"
                  label="Alibaba Cloud"
                  placeholder="sk-..."
                  config={
                    preferences.providerConfigs?.alibaba ?? {
                      mode: 'stagewise',
                    }
                  }
                  onConnect={handleConnectSingleKey}
                  onDisconnect={handleDisconnectApiKey}
                  onFocusProvider={(provider) => {
                    void track('onboarding-auth-api-key-input-focused', {
                      provider,
                    });
                  }}
                />
                <ApiKeyRow
                  provider="deepseek"
                  label="DeepSeek"
                  placeholder="sk-..."
                  config={
                    preferences.providerConfigs?.deepseek ?? {
                      mode: 'stagewise',
                    }
                  }
                  onConnect={handleConnectSingleKey}
                  onDisconnect={handleDisconnectApiKey}
                  onFocusProvider={(provider) => {
                    void track('onboarding-auth-api-key-input-focused', {
                      provider,
                    });
                  }}
                />
                <ApiKeyRow
                  provider="z-ai"
                  label="Z.ai"
                  placeholder="sk-..."
                  config={
                    preferences.providerConfigs?.['z-ai'] ?? {
                      mode: 'stagewise',
                    }
                  }
                  onConnect={handleConnectSingleKey}
                  onDisconnect={handleDisconnectApiKey}
                  onFocusProvider={(provider) => {
                    void track('onboarding-auth-api-key-input-focused', {
                      provider,
                    });
                  }}
                />
              </>
            )}
          </OverlayScrollbar>
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                switchMode('stagewise');
                setError(null);
                setSelectedCodingPlanId(null);
              }}
            >
              Back to login
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setShowMoreProviders((expanded) => {
                  const next = !expanded;
                  void track('onboarding-auth-providers-expanded', {
                    expanded: next,
                  });
                  return next;
                });
              }}
            >
              {showMoreProviders ? 'Show less' : 'Show 4 more providers'}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-error-foreground text-sm">{error}</p>}

      {mode === 'coding-plan' && selectedCodingPlanId === null && (
        <div className="app-no-drag flex w-full max-w-md flex-col gap-3">
          <div className="grid grid-cols-1 gap-3">
            {codingPlans.map((plan) => {
              const cfg = preferences.providerConfigs?.[plan.provider] ?? {
                mode: 'stagewise' as const,
              };
              const isConnected =
                cfg.mode === 'official' && !!cfg.encryptedApiKey;
              return (
                <CodingPlanGridCard
                  key={plan.id}
                  provider={plan.provider}
                  displayName={plan.displayName}
                  tagline={plan.tagline}
                  isConnected={isConnected}
                  onClick={() => {
                    void track('onboarding-auth-coding-plan-opened', {
                      plan_id: plan.id,
                      provider: plan.provider,
                    });
                    setSelectedCodingPlanId(plan.id);
                  }}
                />
              );
            })}
          </div>
          <div className="flex justify-start pt-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                switchMode('stagewise');
                setError(null);
                setSelectedCodingPlanId(null);
              }}
            >
              Back to login
            </Button>
          </div>
        </div>
      )}

      {mode === 'coding-plan' &&
        selectedCodingPlanId !== null &&
        (() => {
          const plan = CODING_PLANS[selectedCodingPlanId];
          const cfg = preferences.providerConfigs?.[plan.provider] ?? {
            mode: 'stagewise' as const,
          };
          return (
            <div className="app-no-drag flex w-full max-w-md flex-col gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setSelectedCodingPlanId(null)}
                  >
                    <IconChevronLeftOutline18 className="size-4" />
                  </Button>
                  <ProviderLogo
                    provider={plan.provider}
                    className="size-5 text-foreground"
                  />
                  <h2 className="font-medium text-foreground text-sm">
                    {plan.displayName}
                  </h2>
                </div>
                <p className="text-muted-foreground text-xs">{plan.tagline}</p>
              </div>
              <CodingPlanCard
                plan={plan}
                config={cfg}
                onConnect={handleConnectSinglePlan}
                onDisconnect={() => handleDisconnectPlan(plan.id)}
                onGetApiKey={handleGetApiKey}
                onConnected={() => setSelectedCodingPlanId(null)}
                hideHeader
                autoFocusInput
              />
            </div>
          );
        })()}

      {mode === 'stagewise' && phase === 'form-input' && (
        <div className="flex flex-col items-center gap-1.5">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              switchMode('api-keys');
              setError(null);
            }}
          >
            Use own API keys
          </Button>
          <div className="flex items-center gap-0">
            <span className="text-subtle-foreground text-xs">or</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                switchMode('coding-plan');
                setError(null);
              }}
            >
              Use existing subscription
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiKeyRow({
  provider,
  label,
  placeholder,
  autoFocus,
  config,
  onConnect,
  onDisconnect,
  onFocusProvider,
}: {
  provider: ProviderKey;
  label: string;
  placeholder: string;
  autoFocus?: boolean;
  config: {
    mode: 'stagewise' | 'official' | 'custom';
    encryptedApiKey?: string | null;
  };
  onConnect: (provider: ProviderKey, apiKey: string) => Promise<ConnectResult>;
  onDisconnect: (provider: ProviderKey) => Promise<void>;
  onFocusProvider?: (provider: ProviderKey) => void;
}) {
  const isConnected = !!config.encryptedApiKey && config.mode === 'official';
  const [localInput, setLocalInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Synchronous in-flight guards. React state updates are async, so overlapping
  // handlers (blur + click, Enter + click) within the same event cycle would
  // otherwise each see `isConnecting === false` and double-fire the RPC.
  const connectInFlightRef = useRef(false);
  const disconnectInFlightRef = useRef(false);
  const focusTrackedRef = useRef(false);
  useEffect(
    () => () => {
      connectInFlightRef.current = false;
      disconnectInFlightRef.current = false;
    },
    [],
  );
  const inputId = `api-key-${provider}`;
  const errorId = `${inputId}-error`;

  useEffect(() => {
    if (!autoFocus || isConnected) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [autoFocus, isConnected]);

  const handleConnect = useCallback(async () => {
    if (connectInFlightRef.current) return;
    const key = localInput.trim();
    if (!key) return;
    connectInFlightRef.current = true;
    setIsConnecting(true);
    setLocalError(null);
    try {
      const res = await onConnect(provider, key);
      if (res.success) {
        setLocalInput('');
      } else {
        setLocalError(res.error);
      }
    } catch {
      setLocalError('Connection failed. Please try again.');
    } finally {
      connectInFlightRef.current = false;
      setIsConnecting(false);
    }
  }, [localInput, onConnect, provider]);

  const handleDisconnect = useCallback(async () => {
    if (disconnectInFlightRef.current) return;
    disconnectInFlightRef.current = true;
    setIsDisconnecting(true);
    try {
      await onDisconnect(provider);
      setLocalError(null);
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Disconnection failed. Please try again.',
      );
    } finally {
      disconnectInFlightRef.current = false;
      setIsDisconnecting(false);
    }
  }, [onDisconnect, provider]);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-muted-foreground text-xs">
        {label}
      </label>
      <div className="flex gap-1.5">
        <Input
          ref={inputRef}
          id={inputId}
          placeholder={placeholder}
          size="sm"
          type="password"
          value={isConnected ? '••••••••••••••••' : localInput}
          aria-invalid={!!localError}
          aria-describedby={localError ? errorId : undefined}
          disabled={isConnecting || isConnected}
          readOnly={isConnected}
          style={{ maxWidth: 'none' }}
          className={cn(
            'min-w-0 flex-1',
            localError && 'border-error-foreground',
          )}
          onValueChange={
            isConnected
              ? undefined
              : (v) => {
                  setLocalInput(v);
                  setLocalError(null);
                }
          }
          onFocus={(e) => {
            if (isConnected || focusTrackedRef.current) return;
            // Ignore programmatic focus (e.g. autoFocus on mount) so the
            // provider-focus telemetry reflects genuine user intent only.
            if (!e.isTrusted) return;
            focusTrackedRef.current = true;
            onFocusProvider?.(provider);
          }}
          onKeyDown={(e) => {
            if (isConnected) return;
            if (e.key === 'Enter' && localInput.trim() && !isConnecting) {
              void handleConnect();
            }
          }}
          onBlur={() => {
            if (isConnected) return;
            if (localInput.trim() && !isConnecting) {
              void handleConnect();
            }
          }}
        />
        {isConnected ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleDisconnect()}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        ) : (
          localInput.trim() && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleConnect()}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting…' : 'Connect'}
            </Button>
          )
        )}
      </div>
      {localError && <TruncatedErrorText id={errorId} text={localError} />}
    </div>
  );
}

function CodingPlanGridCard({
  provider,
  displayName,
  tagline,
  isConnected,
  onClick,
}: {
  provider: ModelProvider;
  displayName: string;
  tagline: string;
  isConnected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border border-derived bg-surface-1 p-3 text-left transition-colors hover:bg-surface-2',
      )}
    >
      <div className="flex shrink-0 items-center justify-center">
        <ProviderLogo provider={provider} className="size-6 text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-foreground text-sm">{displayName}</h3>
        <p className="truncate text-muted-foreground text-xs">{tagline}</p>
      </div>
      {isConnected ? (
        <span className="shrink-0 self-end font-medium text-[11px] text-success-foreground">
          Connected
        </span>
      ) : (
        <IconChevronRightOutline18 className="size-3.5 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

function TruncatedErrorText({ id, text }: { id: string; text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { isTruncated, tooltipOpen, setTooltipOpen } = useIsTruncated(ref);

  return (
    <Tooltip open={isTruncated && tooltipOpen} onOpenChange={setTooltipOpen}>
      <TooltipTrigger>
        <p
          ref={ref}
          id={id}
          role="alert"
          className={cn(
            'truncate text-2xs text-error-foreground',
            isTruncated && 'app-no-drag',
          )}
        >
          {text}
        </p>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        <div className="wrap-break-word line-clamp-12 max-h-48 max-w-xs overflow-y-auto text-2xs leading-relaxed">
          {text}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
