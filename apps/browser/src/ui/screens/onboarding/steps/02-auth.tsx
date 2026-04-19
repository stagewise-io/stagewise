import { Button } from '@stagewise/stage-ui/components/button';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';
import { cn } from '@ui/utils';
import { Input } from '@stagewise/stage-ui/components/input';
import { InputOtp } from '@stagewise/stage-ui/components/input-otp';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useTurnstile } from '@ui/hooks/use-turnstile';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { useIsTruncated } from '@ui/hooks/use-is-truncated';
import type { StepValidityCallback } from '../index';
import type { ApiKeyValidationResult } from '@shared/karton-contracts/ui';
import type { TelemetryLevel } from '@shared/karton-contracts/ui/shared-types';

type AuthMode = 'stagewise' | 'api-keys';
type AuthPhase = 'form-input' | 'waiting-for-otp' | 'authentication-validated';
type ProviderKey = 'anthropic' | 'openai' | 'google' | 'moonshotai' | 'alibaba';
type FieldErrors = Record<ProviderKey, string | null>;

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
  const validateApiKeys = useKartonProcedure(
    (p) => p.userAccount.validateApiKeys,
  );
  const setProviderApiKey = useKartonProcedure(
    (p) => p.preferences.setProviderApiKey,
  );
  const preferencesUpdate = useKartonProcedure((p) => p.preferences.update);
  const authStatus = useKartonState((s) => s.userAccount.status);
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
  const [telemetry, setTelemetry] = useState<TelemetryLevel>('anonymous');
  const emailRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const anthropicKeyRef = useRef<HTMLInputElement>(null);

  const {
    containerRef: turnstileRef,
    token: turnstileToken,
    ready: turnstileReady,
    error: turnstileError,
    enabled: turnstileEnabled,
    reset: resetTurnstile,
  } = useTurnstile();

  const [apiKey1, setApiKey1] = useState('');
  const [apiKey2, setApiKey2] = useState('');
  const [apiKey3, setApiKey3] = useState('');
  const [apiKey4, setApiKey4] = useState('');
  const [apiKey5, setApiKey5] = useState('');
  const emptyErrors: FieldErrors = {
    anthropic: null,
    openai: null,
    google: null,
    moonshotai: null,
    alibaba: null,
  };
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyErrors);

  useEffect(() => {
    if (
      authStatus === 'unauthenticated' &&
      phase === 'authentication-validated'
    ) {
      setPhase('form-input');
      setMode('stagewise');
      setCode('');
      setError(null);
      setFieldErrors(emptyErrors);
    }
  }, [authStatus]);

  useEffect(() => {
    if (
      !isActive &&
      mode === 'api-keys' &&
      phase === 'authentication-validated'
    ) {
      setPhase('form-input');
      setError(null);
      setFieldErrors(emptyErrors);
    }
  }, [isActive]);

  useEffect(() => {
    if (isActive && mode === 'stagewise' && phase === 'form-input')
      requestAnimationFrame(() => emailRef.current?.focus());
  }, [isActive, mode, phase]);

  useEffect(() => {
    if (phase === 'waiting-for-otp') otpRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (mode === 'api-keys') {
      requestAnimationFrame(() => anthropicKeyRef.current?.focus());
    }
  }, [mode]);

  const hasAnyKey = !!(apiKey1 || apiKey2 || apiKey3 || apiKey4 || apiKey5);
  const isValid = phase === 'authentication-validated';

  const handleSubmitApiKeys = useCallback(() => {
    if (loading || !hasAnyKey) return;
    setLoading(true);
    setFieldErrors(emptyErrors);
    void validateApiKeys({
      anthropic: apiKey1,
      openai: apiKey2,
      google: apiKey3,
      moonshotai: apiKey4,
      alibaba: apiKey5,
    })
      .then(async (results) => {
        const next: FieldErrors = { ...emptyErrors };
        for (const key of Object.keys(results) as ProviderKey[]) {
          const r = results[key] as ApiKeyValidationResult;
          next[key] = r && !r.success ? r.error : null;
        }
        setFieldErrors(next);
        if (Object.values(next).every((v) => v === null)) {
          const keysToSave = (
            [
              ['anthropic', apiKey1],
              ['openai', apiKey2],
              ['google', apiKey3],
              ['moonshotai', apiKey4],
              ['alibaba', apiKey5],
            ] as [ProviderKey, string][]
          ).filter(([, v]) => !!v);
          for (const [provider, key] of keysToSave) {
            await setProviderApiKey(provider, key);
            await preferencesUpdate([
              {
                op: 'replace' as const,
                path: ['providerConfigs', provider, 'mode'],
                value: 'official',
              },
            ]);
          }
          setPhase('authentication-validated');
        }
      })
      .finally(() => setLoading(false));
  }, [
    loading,
    hasAnyKey,
    apiKey1,
    apiKey2,
    apiKey3,
    apiKey4,
    apiKey5,
    validateApiKeys,
    setProviderApiKey,
    preferencesUpdate,
  ]);

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
            id="telemetry-anonymous-checkbox"
            checked={telemetry === 'anonymous' || telemetry === 'full'}
            onCheckedChange={(checked: boolean) => {
              setTelemetry(checked ? 'anonymous' : 'off');
              void preferencesUpdate([
                {
                  op: 'replace',
                  path: ['privacy', 'telemetryLevel'],
                  value: checked ? 'anonymous' : 'off',
                },
              ]);
            }}
          />
          <label
            htmlFor="telemetry-anonymous-checkbox"
            className="text-muted-foreground text-xs"
          >
            Help improve stagewise by sharing anonymized events.
          </label>
        </div>
        <div
          className={cn(
            'app-no-drag flex items-center gap-2',
            telemetry === 'off' && 'pointer-events-none opacity-50',
          )}
        >
          <Checkbox
            size="xs"
            id="telemetry-full-checkbox"
            checked={telemetry === 'full'}
            disabled={telemetry === 'off'}
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
      </div>
    );
  }

  if (phase === 'authentication-validated' && mode === 'api-keys') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-4">
          <h1 className="font-medium text-foreground text-xl">
            Your keys have been validated successfully.
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <div className="flex flex-col items-center gap-2 pb-4">
        <h1 className="font-medium text-foreground text-xl">Authenticate</h1>
        {mode === 'stagewise' && phase === 'form-input' && (
          <p className="text-muted-foreground text-sm">
            Get access to the latest models with stagewise.
          </p>
        )}
        {mode === 'stagewise' && phase === 'waiting-for-otp' && (
          <p className="text-muted-foreground text-sm">
            We sent a code to{' '}
            <span className="font-semibold text-muted-foreground">{email}</span>
            . Enter it below.
          </p>
        )}
        {mode === 'api-keys' && (
          <p className="text-muted-foreground text-sm">
            Enter at least one provider key to authenticate.
          </p>
        )}
      </div>

      {/* Turnstile container — visible so interactive challenges can render */}
      <div ref={turnstileRef} />

      {mode === 'stagewise' && phase === 'form-input' && (
        <div className="flex gap-2">
          <Input
            ref={emailRef}
            placeholder="you@example.com"
            size="sm"
            className="app-no-drag"
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
        <div className="flex w-full max-w-xs flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="api-key-1"
              className="text-muted-foreground text-xs"
            >
              Anthropic
            </label>
            <Input
              ref={anthropicKeyRef}
              id="api-key-1"
              placeholder="sk-ant-api01..."
              size="sm"
              className="app-no-drag"
              value={apiKey1}
              aria-invalid={!!fieldErrors.anthropic}
              aria-describedby={
                fieldErrors.anthropic ? 'api-key-1-error' : undefined
              }
              onValueChange={(v) => {
                setApiKey1(v);
                setFieldErrors((prev) => ({ ...prev, anthropic: null }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmitApiKeys();
              }}
            />
            {fieldErrors.anthropic && (
              <TruncatedErrorText
                id="api-key-1-error"
                text={fieldErrors.anthropic}
              />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="api-key-2"
              className="text-muted-foreground text-xs"
            >
              OpenAI
            </label>
            <Input
              id="api-key-2"
              placeholder="sk-proj-LW..."
              size="sm"
              className="app-no-drag"
              value={apiKey2}
              aria-invalid={!!fieldErrors.openai}
              aria-describedby={
                fieldErrors.openai ? 'api-key-2-error' : undefined
              }
              onValueChange={(v) => {
                setApiKey2(v);
                setFieldErrors((prev) => ({ ...prev, openai: null }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmitApiKeys();
              }}
            />
            {fieldErrors.openai && (
              <TruncatedErrorText
                id="api-key-2-error"
                text={fieldErrors.openai}
              />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="api-key-3"
              className="text-muted-foreground text-xs"
            >
              Google
            </label>
            <Input
              id="api-key-3"
              placeholder="AIykSyLeD..."
              size="sm"
              className="app-no-drag"
              value={apiKey3}
              aria-invalid={!!fieldErrors.google}
              aria-describedby={
                fieldErrors.google ? 'api-key-3-error' : undefined
              }
              onValueChange={(v) => {
                setApiKey3(v);
                setFieldErrors((prev) => ({ ...prev, google: null }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmitApiKeys();
              }}
            />
            {fieldErrors.google && (
              <TruncatedErrorText
                id="api-key-3-error"
                text={fieldErrors.google}
              />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="api-key-4"
              className="text-muted-foreground text-xs"
            >
              Moonshot AI
            </label>
            <Input
              id="api-key-4"
              placeholder="sk-..."
              size="sm"
              className="app-no-drag"
              value={apiKey4}
              aria-invalid={!!fieldErrors.moonshotai}
              aria-describedby={
                fieldErrors.moonshotai ? 'api-key-4-error' : undefined
              }
              onValueChange={(v) => {
                setApiKey4(v);
                setFieldErrors((prev) => ({ ...prev, moonshotai: null }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmitApiKeys();
              }}
            />
            {fieldErrors.moonshotai && (
              <TruncatedErrorText
                id="api-key-4-error"
                text={fieldErrors.moonshotai}
              />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="api-key-5"
              className="text-muted-foreground text-xs"
            >
              Alibaba Cloud
            </label>
            <Input
              id="api-key-5"
              placeholder="sk-..."
              size="sm"
              className="app-no-drag"
              value={apiKey5}
              aria-invalid={!!fieldErrors.alibaba}
              aria-describedby={
                fieldErrors.alibaba ? 'api-key-5-error' : undefined
              }
              onValueChange={(v) => {
                setApiKey5(v);
                setFieldErrors((prev) => ({ ...prev, alibaba: null }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmitApiKeys();
              }}
            />
            {fieldErrors.alibaba && (
              <TruncatedErrorText
                id="api-key-5-error"
                text={fieldErrors.alibaba}
              />
            )}
          </div>
        </div>
      )}

      {error && <p className="text-error-foreground text-sm">{error}</p>}

      {mode === 'api-keys' && (
        <div className="flex w-full max-w-xs items-center justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="xs"
            className=""
            onClick={() => {
              setMode('stagewise');
              setError(null);
              setFieldErrors(emptyErrors);
            }}
          >
            Back to login
          </Button>
          <Button
            disabled={loading || !hasAnyKey}
            variant="primary"
            size="sm"
            className=""
            onClick={handleSubmitApiKeys}
          >
            Submit
          </Button>
        </div>
      )}

      {mode === 'stagewise' && phase === 'form-input' && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            setMode('api-keys');
            setError(null);
            setFieldErrors(emptyErrors);
          }}
        >
          I want to use my own API keys
        </Button>
      )}
    </div>
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
