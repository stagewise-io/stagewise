import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import { InputOtp } from '@stagewise/stage-ui/components/input-otp';
import { useKartonProcedure } from '@/hooks/use-karton';
import { Logo } from '@/components/ui/logo';
import { useState, useCallback } from 'react';
import { cn } from '@/utils';

type OtpPhase = 'email' | 'code';

export function NotSignedIn() {
  const sendOtp = useKartonProcedure((p) => p.userAccount.sendOtp);
  const verifyOtp = useKartonProcedure((p) => p.userAccount.verifyOtp);

  const [phase, setPhase] = useState<OtpPhase>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = useCallback(async () => {
    if (!email.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const result = await sendOtp(email.trim());
      if (result?.error) setError(result.error);
      else setPhase('code');
    } catch {
      setError('Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  }, [email, sendOtp]);

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

  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex flex-col items-center justify-center gap-2">
        <Logo className="size-12" />
        <span className="font-medium text-foreground text-xl">
          Authenticate
        </span>
        <span className="text-muted-foreground text-sm">
          Get access to the latest models with stagewise.
        </span>
      </div>

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
            disabled={loading || !email.trim()}
          >
            Sign in
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
