import { Button } from '@stagewise/stage-ui/components/button';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';
import { cn } from '@ui/utils';
import { Input } from '@stagewise/stage-ui/components/input';
import { InputOtp } from '@stagewise/stage-ui/components/input-otp';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
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
import { AwsLogo, ProviderLogo } from '@ui/components/provider-logos';
import {
  IconChevronLeftOutline18,
  IconChevronRightOutline18,
} from 'nucleo-ui-outline-18';
import type { StepValidityCallback } from '../index';
import type {
  ModelProvider,
  Patch,
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

/**
 * Sentinel selection value used on the "Use existing subscription" grid to
 * route to the AWS Bedrock sub-view. Kept distinct from `CodingPlanId` so
 * the type system forces call-sites to handle the non-CodingPlan case.
 */
const BEDROCK_TILE_ID = 'bedrock-profile' as const;
type SubscriptionSelection = CodingPlanId | typeof BEDROCK_TILE_ID;

/**
 * Map an AWS region to the Bedrock cross-region inference-profile prefix
 * required by Claude 4.x on Bedrock. Mirrors the helper in the custom
 * providers settings panel; kept inlined here to avoid exporting UI
 * internals from that file.
 */
function bedrockInferencePrefix(region: string): string {
  if (region.startsWith('us-') || region.startsWith('ca-')) return 'us.';
  if (region.startsWith('eu-')) return 'eu.';
  if (region.startsWith('ap-')) return 'apac.';
  return 'us.';
}

export function StepAuth({
  isActive,
  onValidityChange,
}: {
  isActive: boolean;
  onStepComplete?: () => void;
  onValidityChange?: StepValidityCallback;
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

  // AWS Bedrock login via a named AWS profile. Rendered inside the
  // "Use existing subscription" detail view (no collapse toggle needed).
  const [bedrockProfile, setBedrockProfile] = useState('default');
  const [bedrockRegion, setBedrockRegion] = useState('us-east-1');
  const [bedrockError, setBedrockError] = useState<string | null>(null);
  const [bedrockConnecting, setBedrockConnecting] = useState(false);
  const [bedrockDisconnecting, setBedrockDisconnecting] = useState(false);

  useEffect(() => {
    if (
      authStatus === 'unauthenticated' &&
      phase === 'authentication-validated'
    ) {
      setPhase('form-input');
      setMode('stagewise');
      setCode('');
      setError(null);
      setSelectedCodingPlanId(null);
    }
  }, [authStatus]);

  // Clear transient Bedrock error state when the step goes inactive so the
  // user doesn't return to a stale banner.
  useEffect(() => {
    if (!isActive) setBedrockError(null);
  }, [isActive]);

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

  // "Connected via Bedrock" = anthropic or openai is routed through a custom
  // endpoint whose `apiSpec === 'amazon-bedrock'`. Resolving the referenced
  // `customProviderId` against `preferences.customEndpoints` is required so
  // unrelated custom endpoints (e.g. an OpenAI-compatible proxy the user
  // configured from settings) don't light up the Bedrock tile.
  const bedrockEndpoint = useMemo(() => {
    const cfgs = preferences.providerConfigs ?? {};
    const endpoints = preferences.customEndpoints ?? [];
    const bedrockIds = new Set(
      endpoints
        .filter((e) => e.apiSpec === 'amazon-bedrock')
        .map((e) => e.id),
    );
    const candidateId =
      (cfgs.anthropic?.mode === 'custom' && cfgs.anthropic.customProviderId) ||
      (cfgs.openai?.mode === 'custom' && cfgs.openai.customProviderId) ||
      null;
    if (!candidateId || !bedrockIds.has(candidateId)) return null;
    return endpoints.find((e) => e.id === candidateId) ?? null;
  }, [preferences.providerConfigs, preferences.customEndpoints]);
  const hasConnectedBedrock = bedrockEndpoint !== null;

  // Keep the input fields in sync with a saved Bedrock endpoint so a
  // remount (step navigation, page refresh) shows the actual connected
  // profile/region rather than the hardcoded defaults.
  useEffect(() => {
    if (!bedrockEndpoint) return;
    if (bedrockEndpoint.awsProfileName) {
      setBedrockProfile(bedrockEndpoint.awsProfileName);
    }
    if (bedrockEndpoint.region) {
      setBedrockRegion(bedrockEndpoint.region);
    }
  }, [bedrockEndpoint]);

  const isValid =
    phase === 'authentication-validated' ||
    (mode === 'api-keys' && hasConnectedApiKey) ||
    (mode === 'coding-plan' &&
      (hasConnectedCodingPlan || hasConnectedBedrock));

  const handleConnectSingleKey = useCallback(
    async (provider: ProviderKey, apiKey: string): Promise<ConnectResult> => {
      // Delegate to the backend's atomic `connectProvider` procedure.
      // It validates the key, encrypts+stores it, and flips the provider's
      // endpoint mode to `'official'` in a single RPC. No partial-state
      // window: if any step fails, nothing is persisted.
      return connectProvider(provider, apiKey);
    },
    [connectProvider],
  );

  const handleDisconnectApiKey = useCallback(
    async (provider: ProviderKey) => {
      // Atomic: flips mode back to 'stagewise' AND clears the encrypted key
      // in a single patch update on the backend. No partial-state window.
      await disconnectProvider(provider);
    },
    [disconnectProvider],
  );

  // Connect AWS Bedrock using a named profile. Creates a custom endpoint
  // and routes anthropic + openai providers through it so the built-in
  // model picker works out of the box.
  const handleConnectBedrock = useCallback(async () => {
    const profile = bedrockProfile.trim();
    const region = bedrockRegion.trim();
    if (!profile || !region) {
      setBedrockError('Profile and region are required.');
      return;
    }
    setBedrockConnecting(true);
    setBedrockError(null);
    try {
      const endpointId = crypto.randomUUID();
      // Bedrock requires provider-specific cross-region inference-profile
      // IDs. Without this mapping, `model-provider.ts` throws "Built-in
      // model X cannot be routed through a amazon-bedrock endpoint" the
      // first time the user sends a message.
      const prefix = bedrockInferencePrefix(region);
      const modelIdMapping: Record<string, string> = {
        'claude-opus-4.7': `${prefix}anthropic.claude-opus-4-7`,
        'claude-opus-4.6': `${prefix}anthropic.claude-opus-4-6-v1`,
        'claude-sonnet-4.6': `${prefix}anthropic.claude-sonnet-4-6`,
        'claude-haiku-4.5': `${prefix}anthropic.claude-haiku-4-5-20251001-v1:0`,
      };
      // Emit JSON-patch ops directly rather than going through immer's
      // `produceWithPatches`. The backend applies them to canonical state.
      // Using the `-` array-append sentinel so the add lands at the end
      // regardless of any concurrent mutation between render and apply.
      // Per-field replace ops on providerConfigs preserve any existing
      // `encryptedApiKey` the user may have just stored for that provider.
      const patches: Patch[] = [
        {
          op: 'add',
          path: ['customEndpoints', '-'],
          value: {
            id: endpointId,
            name: `AWS Bedrock (${profile})`,
            apiSpec: 'amazon-bedrock',
            baseUrl: '',
            region,
            awsAuthMode: 'profile',
            awsProfileName: profile,
            modelIdMapping,
          },
        },
        {
          op: 'replace',
          path: ['providerConfigs', 'anthropic', 'mode'],
          value: 'custom',
        },
        {
          op: 'replace',
          path: ['providerConfigs', 'anthropic', 'customProviderId'],
          value: endpointId,
        },
        {
          op: 'replace',
          path: ['providerConfigs', 'openai', 'mode'],
          value: 'custom',
        },
        {
          op: 'replace',
          path: ['providerConfigs', 'openai', 'customProviderId'],
          value: endpointId,
        },
      ];
      await preferencesUpdate(patches);
    } catch (e) {
      setBedrockError(
        e instanceof Error
          ? e.message
          : 'Failed to save Bedrock configuration.',
      );
    } finally {
      setBedrockConnecting(false);
    }
  }, [bedrockProfile, bedrockRegion, preferencesUpdate]);

  // Revert the anthropic + openai provider configs to their stagewise default
  // so Bedrock is no longer the routing target. The custom endpoint stays in
  // `preferences.customEndpoints` so users can re-select it from agent settings.
  const handleDisconnectBedrock = useCallback(async () => {
    setBedrockDisconnecting(true);
    setBedrockError(null);
    try {
      await preferencesUpdate([
        {
          op: 'replace',
          path: ['providerConfigs', 'anthropic', 'mode'],
          value: 'stagewise',
        },
        {
          op: 'replace',
          path: ['providerConfigs', 'openai', 'mode'],
          value: 'stagewise',
        },
      ]);
    } catch (e) {
      setBedrockError(
        e instanceof Error
          ? e.message
          : 'Failed to disconnect Bedrock configuration.',
      );
    } finally {
      setBedrockDisconnecting(false);
    }
  }, [preferencesUpdate]);

  useEffect(() => {
    if (isActive) {
      onValidityChange?.(
        isValid,
        isValid
          ? undefined
          : 'Sign in, provide a provider key, or connect a coding plan',
      );
    }
  }, [isActive, isValid, onValidityChange]);

  const handleSendOtp = useCallback(async () => {
    if (!email.trim()) return;
    if (turnstileEnabled && !turnstileToken && !turnstileError) {
      setError('Security verification not ready. Please wait a moment.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await sendOtp(email.trim(), turnstileToken ?? '');
      if (result?.error) {
        setError(result.error);
        resetTurnstile();
      } else {
        setPhase('waiting-for-otp');
      }
    } catch {
      setError('Failed to send verification code.');
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  }, [
    email,
    sendOtp,
    turnstileToken,
    turnstileEnabled,
    resetTurnstile,
    turnstileError,
  ]);

  const codingPlans = useMemo(() => Object.values(CODING_PLANS), []);

  // Sub-view state for the coding-plan mode. `null` = grid view,
  // otherwise the detail view for that tile. The grid mixes real
  // CodingPlan entries with the AWS Bedrock tile, so the state covers both.
  const [selectedCodingPlanId, setSelectedCodingPlanId] =
    useState<SubscriptionSelection | null>(null);

  const handleConnectSinglePlan = useCallback(
    async (
      planId: CodingPlanId,
      apiKey: string,
    ): Promise<{ success: true } | { success: false; error: string }> => {
      // Delegate to the backend's atomic `connectCodingPlan` procedure.
      // It validates the key, encrypts+stores it, and flips the provider's
      // endpoint mode to `'official'` in a single RPC. No partial state
      // window: if any step fails, nothing is persisted.
      return connectCodingPlan(planId, apiKey);
    },
    [connectCodingPlan],
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
    },
    [disconnectProvider],
  );

  const handleVerifyOtp = useCallback(async () => {
    if (!code.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const result = await verifyOtp(email.trim(), code.trim());
      if (result?.error) setError(result.error);
      else setPhase('authentication-validated');
    } catch {
      setError('Failed to verify code.');
    } finally {
      setLoading(false);
    }
  }, [email, code, verifyOtp]);

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
                />
              </>
            )}
          </OverlayScrollbar>
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setMode('stagewise');
                setError(null);
                setSelectedCodingPlanId(null);
              }}
            >
              Back to login
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setShowMoreProviders((v) => !v)}
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
                  onClick={() => setSelectedCodingPlanId(plan.id)}
                />
              );
            })}
            <BedrockGridCard
              isConnected={hasConnectedBedrock}
              onClick={() => setSelectedCodingPlanId(BEDROCK_TILE_ID)}
            />
          </div>
          <div className="flex justify-start pt-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setMode('stagewise');
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
        selectedCodingPlanId !== BEDROCK_TILE_ID &&
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

      {mode === 'coding-plan' && selectedCodingPlanId === BEDROCK_TILE_ID && (
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
              <AwsLogo className="size-5 text-foreground" />
              <h2 className="font-medium text-foreground text-sm">
                AWS Bedrock
              </h2>
            </div>
            <p className="text-muted-foreground text-xs">
              Route Anthropic and OpenAI model calls through AWS Bedrock using
              a named profile from ~/.aws/credentials (SSO, role assumption,
              etc.).
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-derived p-4">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="bedrock-profile"
                className="text-muted-foreground text-xs"
              >
                AWS Profile Name
              </label>
              <Input
                id="bedrock-profile"
                placeholder="default"
                size="sm"
                value={bedrockProfile}
                onValueChange={(v) => {
                  setBedrockProfile(v);
                  setBedrockError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleConnectBedrock();
                }}
                disabled={hasConnectedBedrock || bedrockConnecting}
                autoFocus={!hasConnectedBedrock}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="bedrock-region"
                className="text-muted-foreground text-xs"
              >
                AWS Region
              </label>
              <Input
                id="bedrock-region"
                placeholder="us-east-1"
                size="sm"
                value={bedrockRegion}
                onValueChange={(v) => {
                  setBedrockRegion(v);
                  setBedrockError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleConnectBedrock();
                }}
                disabled={hasConnectedBedrock || bedrockConnecting}
              />
            </div>
            {bedrockError && (
              <p className="text-2xs text-error-foreground">{bedrockError}</p>
            )}
            <div className="flex justify-end">
              {hasConnectedBedrock ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleDisconnectBedrock()}
                  disabled={bedrockDisconnecting}
                >
                  {bedrockDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleConnectBedrock()}
                  disabled={
                    bedrockConnecting ||
                    !bedrockProfile.trim() ||
                    !bedrockRegion.trim()
                  }
                >
                  {bedrockConnecting ? 'Connecting…' : 'Connect'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {mode === 'stagewise' && phase === 'form-input' && (
        <div className="flex flex-col items-center gap-1.5">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setMode('api-keys');
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
                setMode('coding-plan');
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

/**
 * Grid tile for the AWS Bedrock sub-view. Mirrors `CodingPlanGridCard`'s
 * shape but renders the AWS mark directly — Bedrock is not a
 * `ModelProvider`, so it cannot go through `ProviderLogo`.
 */
function BedrockGridCard({
  isConnected,
  onClick,
}: {
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
        <AwsLogo className="size-6 text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-foreground text-sm">AWS Bedrock</h3>
        <p className="truncate text-muted-foreground text-xs">
          Route Anthropic & OpenAI via a named AWS profile
        </p>
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
