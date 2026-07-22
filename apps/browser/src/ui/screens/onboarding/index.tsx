import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { IconArrowLeftFill18, IconArrowRightFill18 } from '@stagewise/icons';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useTrack } from '@ui/hooks/use-track';
import { cn } from '@ui/utils';
import { StepLogin } from './steps/01-login';
import type { OnboardingAuthCompletion } from './steps/01-login';
import {
  StepConfigureProviders,
  type ProviderStepSummary,
} from './steps/06-configure-providers';
import { StepTheme } from './steps/07-theme';

type ScreenId = 'login' | 'configure-providers' | 'personalization';
type NavigationAction = 'next' | 'back' | 'skip' | 'finish';

export function OnboardingWizard() {
  const [screen, setScreen] = useState<ScreenId>('login');
  const [onboardingRunId] = useState(() => crypto.randomUUID());
  const [authCompletion, setAuthCompletion] =
    useState<OnboardingAuthCompletion | null>(null);
  const providerSummaryRef = useRef<ProviderStepSummary | null>(null);
  const personalizationChangedRef = useRef(false);
  const track = useTrack();
  const authStatus = useKartonState((s) => s.userAccount.status);
  const connectedProviderCount = useKartonState(
    (s) => s.preferences.providerInstances?.length ?? 0,
  );
  const runStartedAtRef = useRef(performance.now());
  const stepEnteredAtRef = useRef(runStartedAtRef.current);
  const currentStepRef = useRef<ScreenId>('login');
  const previousStepRef = useRef<ScreenId | undefined>(undefined);
  const visitCountsRef = useRef<Record<ScreenId, number>>({
    login: 0,
    'configure-providers': 0,
    personalization: 0,
  });
  const startedTrackedRef = useRef(false);
  const lastViewedStepRef = useRef<ScreenId | null>(null);
  const setHasSeenOnboardingFlow = useKartonProcedure(
    (p) => p.userExperience.setHasSeenOnboardingFlow,
  );

  useEffect(() => {
    if (!startedTrackedRef.current) {
      startedTrackedRef.current = true;
      void track('onboarding-started', {
        onboarding_run_id: onboardingRunId,
        already_authenticated:
          authStatus === 'authenticated' || authStatus === 'server_unreachable',
        connected_provider_count: connectedProviderCount,
      });
    }

    if (lastViewedStepRef.current === screen) return;

    const now = performance.now();
    visitCountsRef.current[screen] += 1;
    stepEnteredAtRef.current = now;
    currentStepRef.current = screen;
    lastViewedStepRef.current = screen;
    void track('onboarding-step-viewed', {
      onboarding_run_id: onboardingRunId,
      step: screen,
      previous_step: previousStepRef.current,
      visit_index: visitCountsRef.current[screen],
      elapsed_ms_since_start: now - runStartedAtRef.current,
    });
  }, [authStatus, connectedProviderCount, onboardingRunId, screen, track]);

  const navigate = useCallback(
    (next: ScreenId, action: NavigationAction) => {
      const current = currentStepRef.current;
      void track('onboarding-step-exited', {
        onboarding_run_id: onboardingRunId,
        step: current,
        destination: next,
        action,
        duration_ms: performance.now() - stepEnteredAtRef.current,
      });
      previousStepRef.current = current;
      setScreen(next);
    },
    [onboardingRunId, track],
  );

  const complete = useCallback(() => {
    const current = currentStepRef.current;
    void track('onboarding-step-exited', {
      onboarding_run_id: onboardingRunId,
      step: current,
      destination: 'completed',
      action: 'finish',
      duration_ms: performance.now() - stepEnteredAtRef.current,
    });
    const providerSummary = providerSummaryRef.current;
    setHasSeenOnboardingFlow({
      value: true,
      auth: authCompletion ?? { auth_method: 'unknown' },
      summary: {
        onboarding_run_id: onboardingRunId,
        total_duration_ms: performance.now() - runStartedAtRef.current,
        connected_provider_keys: providerSummary?.connected_provider_keys ?? [],
        connected_provider_count:
          providerSummary?.connected_provider_count ?? 0,
        provider_step_skipped: providerSummary?.provider_step_skipped ?? true,
        personalization_changed: personalizationChangedRef.current,
      },
    });
  }, [authCompletion, onboardingRunId, setHasSeenOnboardingFlow, track]);

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
            onboardingRunId={onboardingRunId}
            onSkip={() => navigate('configure-providers', 'skip')}
            onAuthenticated={(completion) => {
              setAuthCompletion(completion);
              navigate('configure-providers', 'next');
            }}
          />
        )}
        {screen === 'configure-providers' && (
          <StepConfigureProviders
            onboardingRunId={onboardingRunId}
            onSummary={(summary) => {
              const previousSummary = providerSummaryRef.current;
              providerSummaryRef.current = {
                ...summary,
                provider_step_skipped:
                  (previousSummary?.provider_step_skipped ?? true) &&
                  summary.provider_step_skipped,
              };
            }}
            onNext={() => navigate('personalization', 'next')}
            onBack={() => navigate('login', 'back')}
          />
        )}
        {screen === 'personalization' && (
          <StepTheme
            onNext={complete}
            onBack={() => navigate('configure-providers', 'back')}
            onPersonalizationChanged={() => {
              personalizationChangedRef.current = true;
            }}
          />
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
    <div className="app-no-drag flex shrink-0 items-center px-6 pb-6">
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
