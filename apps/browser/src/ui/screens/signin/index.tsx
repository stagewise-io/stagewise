import { AnimatedGradientBackground } from '@/components/ui/animated-gradient-background';
import { Button } from '@stagewise/stage-ui/components/button';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';
import { Logo } from '@/components/ui/logo';
import { ArrowRightIcon, Loader2Icon } from 'lucide-react';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@stagewise/stage-ui/components/dialog';
import { useCallback, useEffect, useState } from 'react';

export const SignInScreen = ({ show }: { show: boolean }) => {
  const startAuth = useKartonProcedure((p) => p.userAccount.startLogin);
  const confirmAuthenticationConfirmation = useKartonProcedure(
    (p) => p.userAccount.confirmAuthenticationConfirmation,
  );
  const cancelAuthenticationConfirmation = useKartonProcedure(
    (p) => p.userAccount.cancelAuthenticationConfirmation,
  );
  const pendingAuthenticationConfirmation = useKartonState(
    (s) => s.userAccount?.pendingAuthenticationConfirmation,
  );

  const [confirmationInProgress, setConfirmationInProgress] = useState(false);
  const [telemetryConsent, setTelemetryConsent] = useState(false);

  useEffect(() => {
    if (pendingAuthenticationConfirmation) {
      setTelemetryConsent(false);
    }
  }, [pendingAuthenticationConfirmation]);

  const confirmAuthentication = useCallback(async () => {
    setConfirmationInProgress(true);
    try {
      await confirmAuthenticationConfirmation();
    } finally {
      setConfirmationInProgress(false);
    }
  }, [confirmAuthenticationConfirmation]);

  return (
    <Dialog open={show} dismissible={false}>
      <DialogContent className="gap-3 delay-150 duration-300 md:p-10">
        <div className="glass-body -ml-0.5 flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full">
          <AnimatedGradientBackground className="absolute inset-0 z-0 size-full" />
          <Logo
            color="white"
            className="z-10 mr-px mb-px size-1/2 shadow-2xs"
          />
        </div>
        <h1 className="text-start font-medium text-3xl">
          {!pendingAuthenticationConfirmation
            ? 'Welcome to stagewise'
            : 'Confirm authentication'}
        </h1>
        <p className="mb-8 text-start text-muted-foreground">
          {!pendingAuthenticationConfirmation
            ? 'Create or sign in to your stagewise account to get started.'
            : 'Please confirm your authentication with stagewise to continue.'}
        </p>

        {pendingAuthenticationConfirmation && (
          <div className="mb-6 space-y-3">
            <p className="text-start text-muted-foreground text-sm">
              We collect telemetry data on free accounts to help us improve
              stagewise, fix bugs faster, and enhance your experience. Paid
              users can opt out in settings.{' '}
              <a
                href="https://stagewise.io/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-700"
              >
                Learn more
              </a>
            </p>
            <div
              className="flex cursor-pointer items-center gap-3"
              onClick={() => setTelemetryConsent(!telemetryConsent)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setTelemetryConsent(!telemetryConsent);
                }
              }}
              role="checkbox"
              aria-checked={telemetryConsent}
              tabIndex={0}
            >
              <Checkbox
                checked={telemetryConsent}
                onCheckedChange={(checked) =>
                  setTelemetryConsent(checked === true)
                }
              />
              <span className="text-muted-foreground text-sm">
                I accept the telemetry data policy
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          {!pendingAuthenticationConfirmation && (
            <Button
              variant="primary"
              size="md"
              onClick={() => void startAuth()}
            >
              Get started
              <ArrowRightIcon className="size-5" />
            </Button>
          )}
          {pendingAuthenticationConfirmation && (
            <>
              <Button
                variant="primary"
                size="md"
                onClick={confirmAuthentication}
                disabled={confirmationInProgress || !telemetryConsent}
              >
                {confirmationInProgress && (
                  <Loader2Icon className="size-5 animate-spin" />
                )}
                Confirm
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => void cancelAuthenticationConfirmation()}
                disabled={confirmationInProgress}
              >
                Cancel
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
