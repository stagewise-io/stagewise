import { useKartonConnected, useKartonState } from '@/hooks/use-karton';
import { Loader2Icon } from 'lucide-react';
import { SignInScreen } from './signin';
import { DefaultLayout } from './main';
import { OpenWorkspaceScreen } from './open-workspace';

export function ScreenRouter() {
  // We render different screens based on the app state.
  const connected = useKartonConnected();

  const authStatus = useKartonState((s) => s.userAccount?.status);

  const workspaceStatus = useKartonState((s) => s.workspaceStatus);

  if (!connected) {
    return (
      <div className="absolute inset-0 flex size-full flex-col items-center justify-center gap-4 bg-zinc-50 p-4 dark:bg-zinc-950">
        <Loader2Icon className="size-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return <SignInScreen />;
  }

  if (workspaceStatus === 'closed') {
    return <OpenWorkspaceScreen />;
  }

  return <DefaultLayout />;
}
