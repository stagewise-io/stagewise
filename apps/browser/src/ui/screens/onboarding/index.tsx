import { useState, useCallback, useEffect, type ReactElement } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { IconArrowLeftFill18, IconArrowRightFill18 } from 'nucleo-ui-fill-18';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { cn } from '@ui/utils';
import { StepWelcome } from './steps/01-welcome';
import { StepAuth } from './steps/02-auth';
import { StepDemo } from './steps/03-demo';
const stepIds = ['welcome', 'auth', 'demo'];

export type StepValidityCallback = (
  canProceed: boolean,
  blockReason?: string,
) => void;

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [canProceed, setCanProceed] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const setHasSeenOnboardingFlow = useKartonProcedure(
    (p) => p.userExperience.setHasSeenOnboardingFlow,
  );

  const isFirstStep = currentStep === 0;
  const isAuthStep = currentStep === 1;
  const isLastStep = currentStep === stepIds.length - 1;
  const hideBackButton = isFirstStep || isAuthStep;

  // Reset validity when navigating between steps.
  // Steps 0 (welcome) and 1 (auth) manage their own validity via
  // onValidityChange, so we only default to true for later steps.
  useEffect(() => {
    if (currentStep > 1) {
      setCanProceed(true);
      setBlockReason(null);
    }
  }, [currentStep]);

  const handleValidityChange: StepValidityCallback = useCallback(
    (valid, reason) => {
      setCanProceed(valid);
      setBlockReason(reason ?? null);
    },
    [],
  );

  const goBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(stepIds.length - 1, prev + 1));
  }, []);

  const complete = useCallback(() => {
    setHasSeenOnboardingFlow(true);
  }, [setHasSeenOnboardingFlow]);

  return (
    <div
      className={cn(
        'app-drag fixed inset-0 flex flex-col bg-background transition-opacity duration-300',
      )}
    >
      {/* Title bar drag region */}
      <div className="h-10 w-full" />

      {/* Step content — StepWelcome is always mounted (hidden when inactive)
           so its typing animation state is preserved when navigating back. */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div
          className={cn('flex flex-1 flex-col', currentStep !== 0 && 'hidden')}
        >
          <StepWelcome
            isActive={currentStep === 0}
            onValidityChange={handleValidityChange}
          />
        </div>
        <div
          className={cn('flex flex-1 flex-col', currentStep !== 1 && 'hidden')}
        >
          <StepAuth
            isActive={currentStep === 1}
            onValidityChange={handleValidityChange}
            onStepComplete={() => goNext()}
          />
        </div>
        {currentStep === 2 && <StepDemo />}
      </div>

      {/* Bottom navigation — flex-1 on left/right ensures dots stay centered */}
      <div className="flex shrink-0 items-center px-6 pb-6">
        {/* Back button */}
        <div className="flex flex-1 justify-start">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            className={cn(hideBackButton && 'invisible')}
          >
            <IconArrowLeftFill18 className="size-4" />
            Back
          </Button>
        </div>

        {/* Step indicator dots */}
        <div className="flex items-center gap-2">
          {stepIds.map((id, index) => (
            <div
              key={id}
              className={cn(
                'size-2 rounded-full transition-colors',
                index === currentStep
                  ? 'bg-foreground'
                  : 'bg-subtle-foreground',
              )}
            />
          ))}
        </div>

        {/* Next / Complete button -- wrapped in a span so the tooltip
             trigger still receives pointer events when the button is disabled */}
        <div className="flex flex-1 justify-end">
          {isLastStep ? (
            <NextButtonTooltip blockReason={blockReason}>
              <Button
                variant="ghost"
                size="sm"
                onClick={complete}
                disabled={!canProceed}
                className="text-primary-foreground! hover:text-hover-derived! active:text-active-derived!"
              >
                Finish
                <IconArrowRightFill18 className="size-4" />
              </Button>
            </NextButtonTooltip>
          ) : (
            <NextButtonTooltip blockReason={blockReason}>
              <Button
                variant="ghost"
                size="sm"
                onClick={goNext}
                disabled={!canProceed}
                className={cn(
                  canProceed &&
                    'text-primary-foreground! hover:text-hover-derived! active:text-active-derived!',
                )}
              >
                Next
                <IconArrowRightFill18 className="size-4" />
              </Button>
            </NextButtonTooltip>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps a button in a tooltip that only activates when there is a blockReason.
 * Uses a <span> wrapper so pointer events fire even when the button is disabled.
 */
function NextButtonTooltip({
  blockReason,
  children,
}: {
  blockReason: string | null;
  children: ReactElement;
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
