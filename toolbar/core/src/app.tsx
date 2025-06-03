import './app.css';

import { ContextProviders } from './components/context-providers';
import { HotkeyListener } from './components/hotkey-listener';
import { DesktopLayout } from './components/layouts/desktop';
import { ClickBlocker } from './components/click-blocker';
import { FocusLock } from './components/focus-lock';
import { VisibilityManager } from './components/visibility-manager';
import { useAppState } from './hooks/use-app-state';
import type { ToolbarConfig } from './config';

export function App(config?: ToolbarConfig) {
  const isMainAppBlocked = useAppState((state) => state.isMainAppBlocked);

  return (
    <>
      <FocusLock />
      <ClickBlocker
        className="fixed inset-0 h-screen w-screen"
        enable={isMainAppBlocked}
      />

      <ContextProviders config={config}>
        <HotkeyListener />
        <VisibilityManager>
          {/* Depending on the screen size, load either the mobile or the desktop companion layout */}
          {/* Until the mobile layout is ready, we will always load the desktop layout */}
          <DesktopLayout />
        </VisibilityManager>
      </ContextProviders>
    </>
  );
}
