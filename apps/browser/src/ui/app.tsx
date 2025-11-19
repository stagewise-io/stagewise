import './app.css';

import type { FunctionComponent } from 'react';
import { ContextProviders } from './components/context-providers';
import { AppStateProvider } from './hooks/use-app-state';
import type { InternalToolbarConfig } from './config';
import { ScreenRouter } from './screens';
import { NotificationToaster } from './notification-toaster';
import { AuthDialog } from './dialogs/auth';
import { FilePickerDialog } from './dialogs/file-picker';
import { TitleManager } from './components/title-manager';

export const App: FunctionComponent<InternalToolbarConfig> = (config) => {
  return (
    <AppStateProvider>
      <ContextProviders config={config}>
        <TitleManager />

        <ScreenRouter />

        <AuthDialog />
        <FilePickerDialog />

        <NotificationToaster />
      </ContextProviders>
    </AppStateProvider>
  );
};
