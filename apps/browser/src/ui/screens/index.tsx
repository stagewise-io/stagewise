import {
  useKartonConnected,
  useKartonReconnectState,
  useKartonState,
} from '@ui/hooks/use-karton';
import { DefaultLayout } from './main';
import { OnboardingWizard } from './onboarding';
import { Logo } from '@ui/components/ui/logo';
import { WebContentsBoundsSyncer } from '@ui/components/web-contents-bounds-syncer';

export function ScreenRouter() {
  // We render different screens based on the app state.
  const connected = useKartonConnected();
  const reconnectState = useKartonReconnectState();
  const hasSeenOnboarding = useKartonState(
    (s) => s.userExperience.storedExperienceData.hasSeenOnboardingFlow,
  );
  const uiZoomPercentage = useKartonState(
    (s) => s.preferences.general.uiZoomPercentage,
  );

  return (
    <div
      className="fixed inset-0"
      style={{
        zoom: uiZoomPercentage / 100,
      }}
    >
      {!connected || hasSeenOnboarding === null ? (
        <div className="absolute inset-0 flex size-full flex-col items-center justify-center gap-4">
          <Logo
            color="white"
            className="w-1/6 max-w-12 drop-shadow-black/30 drop-shadow-lg"
            loading
            loadingSpeed="fast"
          />
          {reconnectState.isReconnecting && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-muted-foreground text-sm">
                Reconnecting... (attempt {reconnectState.attempt}/10)
              </p>
            </div>
          )}
          {reconnectState.failed && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-error-foreground text-sm">
                Connection failed after {reconnectState.attempt} attempts
              </p>
              <p className="text-muted-foreground text-xs">
                Please restart the application
              </p>
            </div>
          )}
        </div>
      ) : hasSeenOnboarding ? (
        <>
          <DefaultLayout show />
          <WebContentsBoundsSyncer />
        </>
      ) : (
        <OnboardingWizard />
      )}
    </div>
  );
}
