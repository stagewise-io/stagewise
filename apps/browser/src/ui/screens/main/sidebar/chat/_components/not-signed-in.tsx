import { Button } from '@stagewise/stage-ui/components/button';
import { IconOpenRectArrowInFillDuo18 } from 'nucleo-ui-fill-duo-18';
import { useKartonProcedure } from '@/hooks/use-karton';

export function NotSignedIn() {
  const startLogin = useKartonProcedure((p) => p.userAccount.startLogin);

  return (
    <div className="flex size-full flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="flex flex-col items-center justify-center gap-1">
        <span className="font-foreground font-medium text-xl">Welcome!</span>
        <span className="text-muted-foreground text-sm">
          Sign in to get started with our AI agent.
        </span>
      </div>
      <Button variant="primary" size="md" onClick={() => startLogin()}>
        Sign into stagewise
        <IconOpenRectArrowInFillDuo18 className="size-4" />
      </Button>
    </div>
  );
}
