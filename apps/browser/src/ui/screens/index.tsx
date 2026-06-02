import { lazy, Suspense } from 'react';
import {
  useKartonConnected,
  useKartonReconnectState,
  useKartonState,
} from '@ui/hooks/use-karton';
import { SettingsScreen } from './settings';
import { Logo } from '@ui/components/ui/logo';
import { WebContentsBoundsSyncer } from '@ui/components/web-contents-bounds-syncer';

// Lazy-load the heavy screen trees. Both `DefaultLayout` and `OnboardingWizard`
// only render *after* the karton connection is established, yet importing them
// statically pulled their entire module graph (tiptap, shiki + oniguruma/wasm,
// prosemirror-highlight, mermaid, code-block stacks, ...) onto the critical
// path to React's first mount. That delayed `did-finish-load`, which gates the
// OS window becoming visible — i.e. the "DevTools open but main window blank"
// wait. Splitting them lets React mount the shell (and the window appear) at
// the connecting spinner immediately; the large chunks load off the critical
// path while the spinner is already shown.
const DefaultLayout = lazy(() =>
  import('./main').then((m) => ({ default: m.DefaultLayout })),
);
const OnboardingWizard = lazy(() =>
  import('./onboarding').then((m) => ({ default: m.OnboardingWizard })),
);

function LoadingScreen({
  reconnectState,
}: {
  reconnectState: ReturnType<typeof useKartonReconnectState>;
}) {
  return (
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
  );
}

export function ScreenRouter() {
  // We render different screens based on the app state.
  const connected = useKartonConnected();
  const reconnectState = useKartonReconnectState();
  const hasSeenOnboarding = useKartonState(
    (s) => s.userExperience.storedExperienceData.hasSeenOnboardingFlow,
  );
  const appScreenMode = useKartonState((s) => s.appScreen.mode);

  return (
    <div className="fixed inset-0">
      {!connected || hasSeenOnboarding === null ? (
        <LoadingScreen reconnectState={reconnectState} />
      ) : hasSeenOnboarding ? (
        appScreenMode === 'settings' ? (
          <SettingsScreen />
        ) : (
          <Suspense
            fallback={<LoadingScreen reconnectState={reconnectState} />}
          >
            <DefaultLayout show />
            <WebContentsBoundsSyncer />
          </Suspense>
        )
      ) : (
        <Suspense fallback={<LoadingScreen reconnectState={reconnectState} />}>
          <OnboardingWizard />
        </Suspense>
      )}
    </div>
  );
}
