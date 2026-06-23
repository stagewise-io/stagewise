import { Button } from '@stagewise/stage-ui/components/button';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';
import { cn } from '@ui/utils';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useState, useCallback } from 'react';
import { useTrack } from '@ui/hooks/use-track';
import {
  SignInOptionsPanel,
  type SignInMethod,
} from '@ui/components/auth/sign-in-options-panel';
import { OnboardingBottomNav } from '../index';
import type { TelemetryLevel } from '@shared/karton-contracts/ui/shared-types';

export type OnboardingAuthCompletion = {
  auth_method: 'stagewise' | 'api-keys' | 'coding-plan' | 'unknown';
  provider?: import('@shared/karton-contracts/ui/shared-types').ModelProvider;
  plan_id?: import('@shared/coding-plan-ids').CodingPlanId;
};

export function StepLogin({
  onSkip,
  onAuthenticated,
}: {
  onSkip: () => void;
  onAuthenticated: (completion: OnboardingAuthCompletion) => void;
}) {
  const sendOtp = useKartonProcedure((p) => p.userAccount.sendOtp);
  const verifyOtp = useKartonProcedure((p) => p.userAccount.verifyOtp);
  const signInSocial = useKartonProcedure((p) => p.userAccount.signInSocial);
  const preferencesUpdate = useKartonProcedure((p) => p.preferences.update);
  const track = useTrack();
  const authStatus = useKartonState((s) => s.userAccount.status);
  const userEmail = useKartonState((s) =>
    s.userAccount.status === 'authenticated' ||
    s.userAccount.status === 'server_unreachable'
      ? s.userAccount.user?.email
      : null,
  );

  const [phase, setPhase] = useState<'form-input' | 'authenticated'>(
    authStatus === 'authenticated' || authStatus === 'server_unreachable'
      ? 'authenticated'
      : 'form-input',
  );
  const [telemetry, setTelemetry] = useState<TelemetryLevel>('anonymous');

  const trackAuthCompleted = useCallback(
    (completion: OnboardingAuthCompletion) => {
      void track('onboarding-auth-method-completed', completion);
      onAuthenticated(completion);
    },
    [onAuthenticated, track],
  );

  const handleStagewiseAuthenticated = useCallback(
    (_method: SignInMethod) => {
      trackAuthCompleted({ auth_method: 'stagewise' });
      setPhase('authenticated');
    },
    [trackAuthCompleted],
  );

  // If the user was already authenticated when they reached this screen,
  // auto-advance immediately. The `phase === 'authenticated'` check means
  // we only auto-advance once — a user who clicks "use a different email"
  // gets the form back.
  if (phase === 'authenticated') {
    return (
      <>
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
        <OnboardingBottomNav
          left={null}
          right={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAuthenticated({ auth_method: 'stagewise' })}
              className="text-primary-foreground! hover:text-hover-derived! active:text-active-derived!"
            >
              Continue
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <SignInOptionsPanel
          sendOtp={(email, token) => sendOtp(email, token ?? '')}
          verifyOtp={verifyOtp}
          signInSocial={signInSocial}
          trackingPrefix="onboarding-auth"
          track={track}
          onAuthenticated={handleStagewiseAuthenticated}
        />
      </div>
      <OnboardingBottomNav
        left={null}
        right={
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className={cn('text-muted-foreground hover:text-foreground')}
          >
            Continue without account
          </Button>
        }
      />
    </>
  );
}
