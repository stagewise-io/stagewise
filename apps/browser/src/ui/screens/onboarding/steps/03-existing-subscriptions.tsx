import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { useTrack } from '@ui/hooks/use-track';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import {
  CodingPlanCard,
  CODING_PLANS,
  TruncatedErrorText,
  type CodingPlanId,
} from '@ui/components/coding-plan-card';
import { ProviderLogo } from '@ui/components/provider-logos';
import {
  IconChevronLeftOutline18,
  IconChevronRightOutline18,
} from 'nucleo-ui-outline-18';
import { cn } from '@ui/utils';
import type { ModelProvider } from '@shared/karton-contracts/ui/shared-types';
import { BackButton, NextButton, OnboardingBottomNav } from '../index';

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

const API_KEY_URLS: Record<ProviderKey, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/app/apikey',
  moonshotai: 'https://platform.moonshot.ai/console/api-keys',
  alibaba: 'https://dashscope.console.aliyun.com/apiKey',
  deepseek: 'https://platform.deepseek.com/api_keys',
  'z-ai': 'https://z.ai/manage-apikey/apikey-list',
};

export function StepExistingSubscriptions({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const disconnectProvider = useKartonProcedure(
    (p) => p.preferences.disconnectProvider,
  );
  const connectCodingPlan = useKartonProcedure(
    (p) => p.preferences.connectCodingPlan,
  );
  const connectProvider = useKartonProcedure(
    (p) => p.preferences.connectProvider,
  );
  const openExternalUrl = useKartonProcedure((p) => p.openExternalUrl);
  const track = useTrack();
  const preferences = useKartonState((s) => s.preferences);

  const [showMoreProviders, setShowMoreProviders] = useState(false);

  // Main content scroll fadeout
  const [contentViewport, setContentViewport] = useState<HTMLElement | null>(
    null,
  );
  const contentScrollRef = useRef<HTMLElement | null>(null);
  contentScrollRef.current = contentViewport;
  const { maskStyle: contentMaskStyle } = useScrollFadeMask(contentScrollRef, {
    axis: 'vertical',
    fadeDistance: 24,
  });

  const hasConnectedApiKey = useMemo(() => {
    const cfgs = preferences.providerConfigs ?? {};
    return API_KEY_PROVIDERS.some(
      (p) => cfgs[p]?.mode === 'official' && !!cfgs[p]?.encryptedApiKey,
    );
  }, [preferences.providerConfigs]);

  const hasConnectedCodingPlan = useMemo(() => {
    const cfgs = preferences.providerConfigs ?? {};
    return Object.values(CODING_PLANS).some((plan) => {
      const cfg = cfgs[plan.provider];
      return (
        cfg?.mode === 'official' &&
        !!cfg.encryptedApiKey &&
        cfg.connectedCodingPlanId === plan.id
      );
    });
  }, [preferences.providerConfigs]);

  const canProceed = hasConnectedApiKey || hasConnectedCodingPlan;

  const handleConnectSingleKey = useCallback(
    async (provider: ProviderKey, apiKey: string): Promise<ConnectResult> => {
      try {
        const result = await connectProvider(provider, apiKey);
        if (!result.success) {
          void track('onboarding-auth-method-failed', {
            auth_method: 'api-keys',
            provider,
            error_kind: 'validation-error',
          });
        }
        return result;
      } catch {
        void track('onboarding-auth-method-failed', {
          auth_method: 'api-keys',
          provider,
          error_kind: 'network-error',
        });
        return {
          success: false,
          error: 'Connection failed. Please try again.',
        };
      }
    },
    [connectProvider, track],
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

  const handleGetApiKey = useCallback(
    (url: string) => {
      void openExternalUrl(url);
    },
    [openExternalUrl],
  );

  const codingPlans = useMemo(() => Object.values(CODING_PLANS), []);

  // Sub-view state for the coding-plan mode.
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
        if (!result.success) {
          void track('onboarding-auth-method-failed', {
            auth_method: 'coding-plan',
            provider,
            plan_id: planId,
            error_kind: 'validation-error',
          });
        }
        return result;
      } catch {
        void track('onboarding-auth-method-failed', {
          auth_method: 'coding-plan',
          provider,
          plan_id: planId,
          error_kind: 'network-error',
        });
        return { success: false, error: 'Connection failed.' };
      }
    },
    [connectCodingPlan, track],
  );

  const handleDisconnectPlan = useCallback(
    async (planId: CodingPlanId) => {
      const provider = CODING_PLANS[planId].provider;
      await disconnectProvider(provider);
      void track('onboarding-auth-provider-disconnected', {
        auth_method: 'coding-plan',
        provider,
        plan_id: planId,
      });
    },
    [disconnectProvider, track],
  );

  const handleSaveCodingPlan = useCallback(
    (planId: CodingPlanId, apiKey: string) =>
      handleConnectSinglePlan(planId, apiKey),
    [handleConnectSinglePlan],
  );

  return (
    <>
      <div className="flex flex-1 flex-col items-center overflow-hidden">
        {/* Coding plan detail sub-view */}
        {selectedCodingPlanId !== null && (
          <div className="app-no-drag flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-8 py-8">
            {(() => {
              const plan = CODING_PLANS[selectedCodingPlanId];
              const cfg = preferences.providerConfigs?.[plan.provider] ?? {
                mode: 'stagewise' as const,
              };
              return (
                <div className="flex w-full flex-col gap-3">
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
                    <p className="text-muted-foreground text-xs">
                      {plan.tagline}
                    </p>
                  </div>
                  <CodingPlanCard
                    plan={plan}
                    config={cfg}
                    onConnect={handleSaveCodingPlan}
                    onDisconnect={() => handleDisconnectPlan(plan.id)}
                    onGetApiKey={handleGetApiKey}
                    onConnected={() => setSelectedCodingPlanId(null)}
                    hideHeader
                    autoFocusInput
                  />
                </div>
              );
            })()}
          </div>
        )}

        {/* Main view: coding plans grid + API keys */}
        {selectedCodingPlanId === null && (
          <OverlayScrollbar
            className="app-no-drag mask-alpha w-full max-w-lg flex-1"
            style={contentMaskStyle}
            onViewportRef={setContentViewport}
            contentClassName="flex flex-col gap-6 px-8 pt-8 pb-4"
          >
            {/* Coding Plans */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col items-center gap-1 pb-1">
                <h1 className="font-medium text-foreground text-xl">
                  Existing Subscriptions
                </h1>
                <p className="text-center text-muted-foreground text-sm">
                  Connect a coding plan or enter API keys for your providers.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {codingPlans.map((plan) => {
                  const cfg = preferences.providerConfigs?.[plan.provider] ?? {
                    mode: 'stagewise' as const,
                  };
                  const isConnected =
                    cfg.mode === 'official' &&
                    !!cfg.encryptedApiKey &&
                    cfg.connectedCodingPlanId === plan.id;
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
            </div>

            {/* Divider */}
            <div className="relative text-center text-subtle-foreground text-xs after:absolute after:inset-x-0 after:top-1/2 after:border-border-subtle after:border-t">
              <span className="relative z-10 bg-background px-2">or</span>
            </div>

            {/* API Keys */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col items-center gap-1">
                <h2 className="font-medium text-foreground text-sm">
                  API Keys
                </h2>
                <p className="text-center text-muted-foreground text-xs">
                  Enter at least one provider key to authenticate.
                </p>
              </div>
              <div className="space-y-3">
                <ApiKeyRow
                  provider="anthropic"
                  label="Anthropic"
                  placeholder="sk-ant-api01..."
                  autoFocus
                  config={
                    preferences.providerConfigs?.anthropic ?? {
                      mode: 'stagewise',
                    }
                  }
                  onConnect={handleConnectSingleKey}
                  onDisconnect={handleDisconnectApiKey}
                  apiKeyUrl={API_KEY_URLS.anthropic}
                  onGetApiKey={handleGetApiKey}
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
                    preferences.providerConfigs?.openai ?? {
                      mode: 'stagewise',
                    }
                  }
                  onConnect={handleConnectSingleKey}
                  onDisconnect={handleDisconnectApiKey}
                  apiKeyUrl={API_KEY_URLS.openai}
                  onGetApiKey={handleGetApiKey}
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
                    preferences.providerConfigs?.google ?? {
                      mode: 'stagewise',
                    }
                  }
                  onConnect={handleConnectSingleKey}
                  onDisconnect={handleDisconnectApiKey}
                  apiKeyUrl={API_KEY_URLS.google}
                  onGetApiKey={handleGetApiKey}
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
                      apiKeyUrl={API_KEY_URLS.moonshotai}
                      onGetApiKey={handleGetApiKey}
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
                      apiKeyUrl={API_KEY_URLS.alibaba}
                      onGetApiKey={handleGetApiKey}
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
                      apiKeyUrl={API_KEY_URLS.deepseek}
                      onGetApiKey={handleGetApiKey}
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
                      apiKeyUrl={API_KEY_URLS['z-ai']}
                      onGetApiKey={handleGetApiKey}
                      onFocusProvider={(provider) => {
                        void track('onboarding-auth-api-key-input-focused', {
                          provider,
                        });
                      }}
                    />
                  </>
                )}
              </div>
              <div className="flex justify-center">
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
          </OverlayScrollbar>
        )}
      </div>
      <OnboardingBottomNav
        left={<BackButton onClick={onBack} />}
        right={
          <NextButton
            onClick={onNext}
            disabled={!canProceed}
            blockReason={
              canProceed
                ? null
                : 'Connect at least one provider or coding plan to continue'
            }
            label="Next"
          />
        }
      />
    </>
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
  apiKeyUrl,
  onGetApiKey,
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
  apiKeyUrl: string;
  onGetApiKey: (url: string) => void;
  onFocusProvider?: (provider: ProviderKey) => void;
}) {
  const isConnected = !!config.encryptedApiKey && config.mode === 'official';
  const [localInput, setLocalInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isCreateKeyVisible, setIsCreateKeyVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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
    <div
      className="flex flex-col gap-1"
      onMouseEnter={() => setIsCreateKeyVisible(true)}
      onMouseLeave={() => setIsCreateKeyVisible(false)}
      onFocus={() => setIsCreateKeyVisible(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsCreateKeyVisible(false);
        }
      }}
    >
      <div className="flex min-h-4 items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-muted-foreground text-xs">
          {label}
        </label>
        {!isConnected && isCreateKeyVisible && (
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                data-skip-auto-connect="true"
                className="text-primary-foreground text-xs transition-colors hover:cursor-pointer hover:text-hover-derived"
                onClick={() => onGetApiKey(apiKeyUrl)}
              >
                Create key
              </button>
            </TooltipTrigger>
            <TooltipContent>{apiKeyUrl}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex gap-1.5">
        <Input
          ref={inputRef}
          id={inputId}
          placeholder={placeholder}
          size="sm"
          type="password"
          value={
            isConnected
              ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
              : localInput
          }
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
          onBlur={(event) => {
            if (isConnected) return;
            if (
              event.relatedTarget instanceof HTMLElement &&
              event.relatedTarget.closest('[data-skip-auto-connect="true"]')
            ) {
              return;
            }
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
            {isDisconnecting ? 'Disconnecting\u2026' : 'Disconnect'}
          </Button>
        ) : (
          localInput.trim() && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleConnect()}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting\u2026' : 'Connect'}
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
