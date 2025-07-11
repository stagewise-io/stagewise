import './app.css';

import { ContextProviders } from './components/context-providers';
import { HotkeyListener } from './components/hotkey-listener';
import { DefaultLayout } from './layouts/default';
import { AppStateProvider } from './hooks/use-app-state';
import type { InternalToolbarConfig } from './config';
import { MainAppBlocker } from './components/main-app-blocker';

export function App(config?: InternalToolbarConfig) {
  return (
    <AppStateProvider>
      <MainAppBlocker />
      <ContextProviders config={config}>
        <HotkeyListener />
        {/* Depending on the screen size, load either the mobile or the desktop companion layout */}
        {/* Until the mobile layout is ready, we will always load the desktop layout */}
        <DefaultLayout />
      </ContextProviders>
    </AppStateProvider>
  );
}
