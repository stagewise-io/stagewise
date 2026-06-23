import { Logo } from '@ui/components/ui/logo';
import { BackButton, OnboardingBottomNav } from '../index';
import { Button } from '@stagewise/stage-ui/components/button';
import { IconArrowRightFill18 } from 'nucleo-ui-fill-18';
import { cn } from '@ui/utils';

export function StepDone({
  onComplete,
  onBack,
}: {
  onComplete: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <Logo className="mb-4 size-16" />
        <h1 className="font-medium text-foreground text-xl">
          You&apos;re all set!
        </h1>
        <p className="max-w-sm text-center text-muted-foreground text-sm">
          stagewise is ready to go. The tutorial will guide you through the key
          features as you start using the app.
        </p>
      </div>
      <OnboardingBottomNav
        left={<BackButton onClick={onBack} />}
        right={
          <Button
            variant="ghost"
            size="sm"
            onClick={onComplete}
            className={cn(
              'text-primary-foreground! hover:text-hover-derived! active:text-active-derived!',
            )}
          >
            Finish
            <IconArrowRightFill18 className="size-4" />
          </Button>
        }
      />
    </>
  );
}
