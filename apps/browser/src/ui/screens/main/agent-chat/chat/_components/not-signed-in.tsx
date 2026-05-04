import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import { InputOtp } from '@stagewise/stage-ui/components/input-otp';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { Logo } from '@ui/components/ui/logo';
import { useState, useCallback } from 'react';
import { cn } from '@ui/utils';
import { useTurnstile } from '@ui/hooks/use-turnstile';

type OtpPhase = 'email' | 'code';

export function NotSignedIn() {
  const sendOtp = useKartonProcedure((p) => p.userAccount.sendOtp);
  const verifyOtp = useKartonProcedure((p) => p.userAccount.verifyOtp);

  const [phase, setPhase] = useState<OtpPhase>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    containerRef,
    token,
    ready,
    error: turnstileError,
    enabled,
    reset,
  } = useTurnstile();

  const handleSendOtp = useCallback(async () => {
    if (!email.trim()) return;
    if (enabled && !token && !turnstileError) {
      setError('Security verification not ready. Please wait a moment.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await sendOtp(email.trim(), token ?? '');
      if (result?.error) {
        setError(result.error);
        reset();
      } else {
        setPhase('code');
      }
    } catch {
      setError('Failed to send verification code.');
      reset();
    } finally {
      setLoading(false);
    }
  }, [email, sendOtp, token, enabled, reset, turnstileError]);

  const handleVerifyOtp = useCallback(async () => {
    if (!code.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const result = await verifyOtp(email.trim(), code.trim());
      if (result?.error) setError(result.error);
    } catch {
      setError('Failed to verify code.');
    } finally {
      setLoading(false);
    }
  }, [email, code, verifyOtp]);

  const canSend = enabled
    ? (!!token || turnstileError) && !!email.trim()
    : !!email.trim();

  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex flex-col items-center justify-center gap-2">
        <Logo className="mb-2 size-12" />
        <span className="font-medium text-foreground text-xl">
          Authenticate
        </span>
        <span className="text-muted-foreground text-sm">
          Get access to the latest models with stagewise.
        </span>
      </div>

      {/* Turnstile container — visible so interactive challenges can render */}
      <div ref={containerRef} />

      {phase === 'email' && (
        <div className="flex gap-2">
          <Input
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
            size="sm"
            className="shrink-0"
            onClick={() => void handleSendOtp()}
            disabled={loading || !canSend}
          >
            {enabled && !ready && !turnstileError ? 'Loading...' : 'Sign in'}
          </Button>
        </div>
      )}
      {phase === 'email' && (
        <a
          href="stagewise://internal/agent-settings/models-providers"
          className={cn(buttonVariants({ variant: 'ghost', size: 'xs' }))}
        >
          I want to use my own API keys
        </a>
      )}

      {phase === 'code' && (
        <div className="flex flex-col items-center gap-4">
          <p className="font-normal text-muted-foreground text-sm">
            We sent a code to{' '}
            <span className="font-medium text-muted-foreground">{email}</span>.
          </p>
          <InputOtp
            length={6}
            size="sm"
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
              setPhase('email');
              setCode('');
              setError(null);
              reset();
            }}
          >
            Use a different email
          </Button>
        </div>
      )}

      {error && <p className="text-error-foreground text-sm">{error}</p>}
    </div>
  );
}
