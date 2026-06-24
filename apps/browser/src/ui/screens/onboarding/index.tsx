import { useState, useCallback, type ReactNode } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { IconArrowLeftFill18, IconArrowRightFill18 } from 'nucleo-ui-fill-18';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { cn } from '@ui/utils';
import { StepLogin } from './steps/01-login';
import type { OnboardingAuthCompletion } from './steps/01-login';
import { StepModelAccess } from './steps/02-model-access';
import { StepExistingSubscriptions } from './steps/03-existing-subscriptions';
import { StepCustomEndpoints } from './steps/04-custom-endpoints';
import { StepCustomModels } from './steps/05-custom-models';
import { StepDone } from './steps/06-done';
import { StepTheme } from './steps/07-theme';

type ScreenId =
  | 'login'
  | 'model-access'
  | 'existing-subscriptions'
  | 'custom-endpoints'
  | 'custom-models'
  | 'theme'
  | 'done';

export function OnboardingWizard() {
  const [screen, setScreen] = useState<ScreenId>('login');
  const [authCompletion, setAuthCompletion] =
    useState<OnboardingAuthCompletion | null>(null);
  const setHasSeenOnboardingFlow = useKartonProcedure(
    (p) => p.userExperience.setHasSeenOnboardingFlow,
  );

  const navigate = useCallback((next: ScreenId) => {
    setScreen(next);
  }, []);

  const complete = useCallback(() => {
    setHasSeenOnboardingFlow({
      value: true,
      auth: authCompletion ?? { auth_method: 'unknown' },
    });
  }, [authCompletion, setHasSeenOnboardingFlow]);

  return (
    <div
      className={cn(
        'app-drag fixed inset-0 flex flex-col bg-background transition-opacity duration-300',
      )}
    >
      {/* Title bar drag region */}
      <div className="h-10 w-full" />

      {/* Screen content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {screen === 'login' && (
          <StepLogin
            onSkip={() => navigate('model-access')}
            onAuthenticated={(completion) => {
              setAuthCompletion(completion);
              navigate('model-access');
            }}
          />
        )}
        {screen === 'model-access' && (
          <StepModelAccess
            onSelectStagewise={() => navigate('theme')}
            onSelectExistingSubscriptions={() =>
              navigate('existing-subscriptions')
            }
            onSelectCustomEndpoints={() => navigate('custom-endpoints')}
            onBack={() => navigate('login')}
          />
        )}
        {screen === 'existing-subscriptions' && (
          <StepExistingSubscriptions
            onNext={() => navigate('theme')}
            onBack={() => navigate('model-access')}
          />
        )}
        {screen === 'custom-endpoints' && (
          <StepCustomEndpoints
            onNext={() => navigate('custom-models')}
            onBack={() => navigate('model-access')}
          />
        )}
        {screen === 'custom-models' && (
          <StepCustomModels
            onNext={() => navigate('theme')}
            onBack={() => navigate('custom-endpoints')}
          />
        )}
        {screen === 'theme' && (
          <StepTheme
            onNext={() => navigate('done')}
            onBack={() => navigate('model-access')}
          />
        )}
        {screen === 'done' && (
          <StepDone onComplete={complete} onBack={() => navigate('theme')} />
        )}
      </div>
    </div>
  );
}

/**
 * Bottom navigation bar shared across onboarding screens.
 * Left: optional back button. Right: optional next/finish button.
 * Either side may be omitted by passing `null`.
 */
export function OnboardingBottomNav({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center px-6 pb-6">
      <div className="flex flex-1 justify-start">{left ?? <span />}</div>
      <div className="flex flex-1 justify-end">{right ?? <span />}</div>
    </div>
  );
}

/** Back button styled consistently across screens. */
export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      <IconArrowLeftFill18 className="size-4" />
      Back
    </Button>
  );
}

/**
 * Next button with optional disabled tooltip. Mirrors the old
 * `NextButtonTooltip` pattern so blocked state is surfaced to the user.
 */
export function NextButton({
  onClick,
  disabled,
  blockReason,
  label = 'Next',
}: {
  onClick: () => void;
  disabled?: boolean;
  blockReason?: string | null;
  label?: string;
}) {
  return (
    <NavButtonTooltip blockReason={blockReason}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          !disabled &&
            'text-primary-foreground! hover:text-hover-derived! active:text-active-derived!',
        )}
      >
        {label}
        <IconArrowRightFill18 className="size-4" />
      </Button>
    </NavButtonTooltip>
  );
}

/**
 * Wraps a button in a tooltip that only activates when there is a blockReason.
 * Uses a <span> wrapper so pointer events fire even when the button is disabled.
 */
function NavButtonTooltip({
  blockReason,
  children,
}: {
  blockReason: string | null | undefined;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const showTooltip = hovered && !!blockReason;

  return (
    <Tooltip open={showTooltip}>
      <TooltipTrigger>
        <span
          className="app-no-drag inline-flex"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{blockReason}</TooltipContent>
    </Tooltip>
  );
}
