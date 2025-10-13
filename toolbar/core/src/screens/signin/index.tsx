import { AnimatedGradientBackground } from '@/components/ui/animated-gradient-background';
import { Button } from '@stagewise/stage-ui/components/button';
import { Logo } from '@/components/ui/logo';
import { ArrowRightIcon, Loader2Icon } from 'lucide-react';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@stagewise/stage-ui/components/dialog';

export const SignInScreen = ({ show }: { show: boolean }) => {
  const startAuth = useKartonProcedure((p) => p.userAccount.startLogin);

  const authInProgress = useKartonState((s) => s.userAccount?.loginDialog);

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
          Welcome to stagewise
        </h1>
        <p className="mb-8 text-start text-muted-foreground">
          Create or sign in to your stagewise account to get started.
        </p>

        <DialogFooter>
          <Button
            variant="primary"
            size="md"
            onClick={() => void startAuth()}
            disabled={authInProgress !== null}
          >
            {authInProgress !== null && (
              <Loader2Icon className="size-5 animate-spin" />
            )}
            Get started
            <ArrowRightIcon className="size-5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
