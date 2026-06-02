import { Button } from '@stagewise/stage-ui/components/button';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';
import { Input } from '@stagewise/stage-ui/components/input';
import { InputOtp } from '@stagewise/stage-ui/components/input-otp';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useTrack } from '@ui/hooks/use-track';
import { useState, useCallback, useRef, useEffect } from 'react';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { cn } from '@ui/utils';
import { produceWithPatches } from 'immer';
import type { TelemetryLevel } from '@shared/karton-contracts/ui/shared-types';
import type { CurrentUsageResponse } from '@shared/karton-contracts/pages-api/types';

const CONSOLE_URL =
  import.meta.env.VITE_STAGEWISE_CONSOLE_URL || 'https://console.stagewise.io';

type AuthPhase = 'form-input' | 'waiting-for-otp';

export function AccountSection() {
  const userAccount = useKartonState((s) => s.userAccount);
  const sendOtp = useKartonProcedure((p) => p.userAccount.sendOtp);
  const verifyOtp = useKartonProcedure((p) => p.userAccount.verifyOtp);
  const logout = useKartonProcedure((p) => p.userAccount.logout);
  // `useTrack` swallows RPC errors so a failed telemetry capture (e.g.
  // backend karton server unavailable) cannot crash the page.
  const track = useTrack();

  // Fire once per mounted route instance. The ref guard prevents React
  // StrictMode's development double-invocation; intentional route remounts
  // should still emit a fresh page-view event.
  const didTrackViewRef = useRef(false);
  useEffect(() => {
    if (didTrackViewRef.current) return;
    didTrackViewRef.current = true;
    track('account-page-viewed');
  }, [track]);

  return (
    <div className="h-full w-full">
      {/* Content */}
      <OverlayScrollbar className="h-full" contentClassName="px-6 pt-24 pb-24">
        <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-8">
          {/* Header */}
          <div>
            <h1 className="font-semibold text-foreground text-xl">Account</h1>
          </div>
          {userAccount?.status === 'authenticated' ||
          userAccount?.status === 'server_unreachable' ? (
            <AuthenticatedView
              email={userAccount.user?.email}
              subscription={userAccount.subscription}
              machineId={userAccount.machineId}
              onLogout={() => void logout()}
            />
          ) : (
            <LoginView sendOtp={sendOtp} verifyOtp={verifyOtp} />
          )}
        </div>
      </OverlayScrollbar>
    </div>
  );
}

function AuthenticatedView({
  email,
  subscription,
  machineId,
  onLogout,
}: {
  email?: string;
  subscription?: {
    active: boolean;
    plan?: string;
    expiresAt?: string;
  };
  machineId?: string;
  onLogout: () => void;
}) {
  const openExternalUrl = useKartonProcedure((p) => p.openExternalUrl);

  return (
    <>
      {/* User info */}
      <div className="flex flex-col gap-2">
        <h2 className="font-medium text-foreground text-lg">
          {email ?? 'Unknown user'}
        </h2>
        <p className="text-muted-foreground text-sm">Signed in</p>
      </div>

      <hr className="border-border-subtle" />

      {/* Account details */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-y-3">
          <div className="grid grid-cols-[140px_1fr] gap-x-4">
            <span className="font-medium text-muted-foreground text-sm">
              Email
            </span>
            <span className="break-all text-foreground text-sm">{email}</span>
          </div>

          {subscription && (
            <>
              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Plan
                </span>
                <span className="text-foreground text-sm capitalize">
                  {subscription.plan ?? 'Free'}
                </span>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Status
                </span>
                <span className="text-foreground text-sm">
                  {subscription.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {subscription.expiresAt && (
                <div className="grid grid-cols-[140px_1fr] gap-x-4">
                  <span className="font-medium text-muted-foreground text-sm">
                    Expires
                  </span>
                  <span className="text-foreground text-sm">
                    {new Date(subscription.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </>
          )}

          {machineId && (
            <div className="grid grid-cols-[140px_1fr] gap-x-4">
              <span className="font-medium text-muted-foreground text-sm">
                Machine ID
              </span>
              <span className="break-all font-mono text-foreground text-sm">
                {machineId}
              </span>
            </div>
          )}
        </div>
      </div>

      <hr className="border-border-subtle" />

      <TelemetrySetting />

      <hr className="border-border-subtle" />

      <UsageSection />

      <hr className="border-border-subtle" />

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onLogout}>
          Sign out
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void openExternalUrl(CONSOLE_URL)}
        >
          Open Console
        </Button>
      </div>
    </>
  );
}

const WINDOW_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

function formatCredits(raw: number): string {
  const dollars = raw / 10_000;
  return `$${dollars.toFixed(2)}`;
}

function formatResetTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return 'now';
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 24) return `in ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `in ${diffD}d`;
}

function UsageSection() {
  const getUsageCurrent = useKartonProcedure(
    (p) => p.userAccount.getUsageCurrent,
  );
  const getUsageCurrentRef = useRef(getUsageCurrent);
  getUsageCurrentRef.current = getUsageCurrent;
  const [usage, setUsage] = useState<CurrentUsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUsageCurrentRef
      .current()
      .then((data) => {
        if (!cancelled) setUsage(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Failed to load usage data.';
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-medium text-foreground">Usage</h3>

      {loading && (
        <p className="text-muted-foreground text-sm">Loading usage...</p>
      )}

      {error && <p className="text-error-foreground text-sm">{error}</p>}

      {usage && (
        <div className="flex flex-col gap-5">
          {/* Credits */}
          <div className="grid grid-cols-[140px_1fr] gap-x-4">
            <span className="font-medium text-muted-foreground text-sm">
              Credits
            </span>
            <span className="text-foreground text-sm">
              {formatCredits(usage.prepaidBalance)} remaining
            </span>
          </div>

          {/* Rate-limit windows */}
          <div className="flex flex-col gap-3">
            {usage.windows.map((w) => {
              const remaining = Math.max(0, 100 - w.usedPercent);
              const barColor =
                w.usedPercent >= 100
                  ? 'bg-error-solid'
                  : w.usedPercent > 80
                    ? 'bg-warning-solid'
                    : 'bg-primary-solid';
              return (
                <div key={w.type} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground text-sm">
                      {WINDOW_LABELS[w.type] ?? w.type}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {remaining.toFixed(0)}% left &middot; resets{' '}
                      {formatResetTime(w.resetsAt)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-1">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${w.usedPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TelemetrySetting() {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);

  const telemetryMode = preferences.privacy.telemetryLevel;

  const handleTelemetryChange = async (value: TelemetryLevel) => {
    const [, patches] = produceWithPatches(preferences, (draft) => {
      draft.privacy.telemetryLevel = value;
    });
    await updatePreferences(patches);
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-medium text-foreground">Telemetry</h3>
      <p className="text-muted-foreground text-sm">
        Control what usage data is collected to help improve stagewise.
      </p>

      <div className="flex items-center gap-2">
        <Checkbox
          size="xs"
          id="telemetry-anonymous-checkbox"
          checked={telemetryMode === 'anonymous' || telemetryMode === 'full'}
          onCheckedChange={(checked: boolean) => {
            void handleTelemetryChange(checked ? 'anonymous' : 'off');
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
          'flex items-center gap-2',
          telemetryMode === 'off' && 'pointer-events-none opacity-50',
        )}
      >
        <Checkbox
          size="xs"
          id="telemetry-full-checkbox"
          checked={telemetryMode === 'full'}
          disabled={telemetryMode === 'off'}
          onCheckedChange={(checked: boolean) => {
            void handleTelemetryChange(checked ? 'full' : 'anonymous');
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

function LoginView({
  sendOtp,
  verifyOtp,
}: {
  sendOtp: (
    email: string,
    turnstileToken: string,
  ) => Promise<{ error?: string }>;
  verifyOtp: (email: string, code: string) => Promise<{ error?: string }>;
}) {
  const [phase, setPhase] = useState<AuthPhase>('form-input');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (phase === 'form-input') emailRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase === 'waiting-for-otp') otpRef.current?.focus();
  }, [phase]);

  const handleSendOtp = useCallback(async () => {
    if (!email.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const turnstileToken = (await window.__solveTurnstile?.()) ?? '';
      const result = await sendOtp(email.trim(), turnstileToken);
      if (result?.error) setError(result.error);
      else setPhase('waiting-for-otp');
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
      // On success, the auth state change callback will update userAccount
      // and the parent component will switch to AuthenticatedView
    } catch {
      setError('Failed to verify code.');
    } finally {
      setLoading(false);
    }
  }, [email, code, verifyOtp]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <h2 className="font-medium text-foreground text-lg">Authenticate</h2>
        {phase === 'form-input' && (
          <p className="text-muted-foreground text-sm">
            Get access to the latest models with stagewise.
          </p>
        )}
        {phase === 'waiting-for-otp' && (
          <p className="text-muted-foreground text-sm">
            We sent a code to{' '}
            <span className="font-medium text-foreground">{email}</span>.
          </p>
        )}
      </div>

      <hr className="border-border-subtle" />

      {phase === 'form-input' && (
        <div className="flex max-w-sm flex-col gap-4">
          <div className="flex gap-2">
            <Input
              ref={emailRef}
              placeholder="you@example.com"
              size="sm"
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
        </div>
      )}

      {phase === 'waiting-for-otp' && (
        <div className="flex flex-col items-start gap-4">
          <div className="flex items-center gap-2">
            <InputOtp
              ref={otpRef}
              length={6}
              size="sm"
              value={code}
              onChange={(val) => setCode(val)}
              onComplete={() => void handleVerifyOtp()}
              disabled={loading}
            />
            <Button
              variant="primary"
              size="sm"
              className="shrink-0"
              onClick={() => void handleVerifyOtp()}
              disabled={loading || code.length < 6}
            >
              {loading ? 'Verifying...' : 'Verify'}
            </Button>
          </div>
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
      )}

      {error && <p className="text-error-foreground text-sm">{error}</p>}
    </>
  );
}
