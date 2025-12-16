import {
  useKartonConnected,
  useKartonReconnectState,
  useKartonState,
} from '@/hooks/use-karton';
import { SignInScreen } from './signin';
import { DefaultLayout } from './main';
import Iridescence from '@/components/ui/iridescence';
import { cn } from '@/utils';
import { Layout } from '@shared/karton-contracts/ui';
import { Logo } from '@/components/ui/logo';
import { WebContentsBoundsSyncer } from '@/components/web-contents-bounds-syncer';

export function ScreenRouter() {
  // We render different screens based on the app state.
  const connected = useKartonConnected();
  const reconnectState = useKartonReconnectState();

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
        <div className="absolute inset-0 flex size-full flex-col items-center justify-center gap-4">
          <Logo
            color="white"
            className="w-1/6 max-w-12 drop-shadow-black/30 drop-shadow-lg"
            loading
            loadingSpeed="fast"
          />
          {reconnectState.isReconnecting && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-white/70">
                Reconnecting... (attempt {reconnectState.attempt}/10)
              </p>
            </div>
          )}
          {reconnectState.failed && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-red-400 text-sm">
                Connection failed after {reconnectState.attempt} attempts
              </p>
              <p className="text-white/50 text-xs">
                Please restart the application
              </p>
            </div>
          )}
        </div>
      )}

      <SignInScreen show={connected && displayedLayout === Layout.SIGNIN} />

      <DefaultLayout show={connected && displayedLayout === Layout.MAIN} />

      <WebContentsBoundsSyncer />
    </div>
  );
}
