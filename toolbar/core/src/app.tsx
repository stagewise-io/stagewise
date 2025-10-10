import './app.css';

import type { FunctionComponent } from 'react';
import { ContextProviders } from './components/context-providers';
import { HotkeyListener } from './components/hotkey-listener';
import { AppStateProvider } from './hooks/use-app-state';
import type { InternalToolbarConfig } from './config';
import { UrlSynchronizer } from './components/url-synchronizer';
import { MetaSynchronizer } from './components/meta-synchronizer';
import { ScreenRouter } from './screens';
import { NotificationToaster } from './notification-toaster';
import { WorkspaceSetupDialog } from './dialogs/workspace-setup';
import { AuthDialog } from './dialogs/auth';
import { FilePickerDialog } from './dialogs/file-picker';

export const App: FunctionComponent<InternalToolbarConfig> = (config) => {
  return (
    <>
      <UrlSynchronizer
        appPort={config?.appPort}
        urlSyncConfig={config?.urlSync}
      />
      <MetaSynchronizer />
      <AppStateProvider>
        <ContextProviders config={config}>
          <HotkeyListener />

          <ScreenRouter />

          <AuthDialog />
          <FilePickerDialog />
          <WorkspaceSetupDialog />

          <NotificationToaster />
        </ContextProviders>
      </AppStateProvider>
    </>
  );
};
