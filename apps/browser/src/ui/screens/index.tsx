import { useKartonConnected, useKartonState } from '@/hooks/use-karton';
import { SignInScreen } from './signin';
import { DefaultLayout } from './main';
import { OpenWorkspaceScreen } from './open-workspace';
import Iridescence from '@/components/ui/iridescence';
import { cn } from '@/utils';
import { Layout } from '@stagewise/karton-contract';
import { Logo } from '@/components/ui/logo';
import { SetupWorkspaceScreen } from './setup-workspace';

export function ScreenRouter() {
  // We render different screens based on the app state.
  const connected = useKartonConnected();

  const displayedLayout = useKartonState((s) => s.userExperience.activeLayout);

  return (
    <div className="fixed inset-0">
      {connected && displayedLayout !== Layout.MAIN && (
        <Iridescence
          className={cn(
            '-z-10 app-drag pointer-events-none absolute inset-0 opacity-100 duration-1000 ease-out',
          )}
          color={[0.7, 0.9, 1]}
          speed={0.1}
        />
      )}

      {!connected && (
        <div className="absolute inset-0 flex size-full flex-col items-center justify-center">
          <Logo
            color="white"
            className="w-1/6 max-w-12 drop-shadow-black/30 drop-shadow-lg"
            loading
            loadingSpeed="fast"
          />
        </div>
      )}

      <SignInScreen show={connected && displayedLayout === Layout.SIGNIN} />

      <OpenWorkspaceScreen
        show={connected && displayedLayout === Layout.OPEN_WORKSPACE}
      />

      <SetupWorkspaceScreen
        show={connected && displayedLayout === Layout.SETUP_WORKSPACE}
      />

      <DefaultLayout show={connected && displayedLayout === Layout.MAIN} />
    </div>
  );
}
