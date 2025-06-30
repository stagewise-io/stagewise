import './app.css';

import { ContextProviders } from './components/context-providers';
import { HotkeyListener } from './components/hotkey-listener';
import { DesktopLayout } from './components/layouts/desktop';
import { AppStateProvider } from './hooks/use-app-state';
import type { ToolbarConfig } from './config';
import { MainAppBlocker } from './components/main-app-blocker';

export function App(config?: ToolbarConfig) {
  return (
    <AppStateProvider>
      <MainAppBlocker />
      <ContextProviders config={config}>
        <HotkeyListener />
        {/* Depending on the screen size, load either the mobile or the desktop companion layout */}
        {/* Until the mobile layout is ready, we will always load the desktop layout */}
        <DesktopLayout />
      </ContextProviders>
    </AppStateProvider>
  );
}
