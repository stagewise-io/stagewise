import './app.css';

import type { FunctionComponent } from 'react';
import { ContextProviders } from './components/context-providers';
import { AppStateProvider } from './hooks/use-app-state';
import { ScreenRouter } from './screens';
import { NotificationToaster } from './notification-toaster';
import { TitleManager } from './components/title-manager';

export const App: FunctionComponent = () => {
  return (
    <AppStateProvider>
      <ContextProviders>
        <TitleManager />

        <ScreenRouter />

        <NotificationToaster />
      </ContextProviders>
    </AppStateProvider>
  );
};
