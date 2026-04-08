import './app.css';

import type { FunctionComponent } from 'react';
import { ContextProviders } from './components/context-providers';
import { ScreenRouter } from './screens';
import { TitleManager } from './components/title-manager';

export const App: FunctionComponent = () => {
  return (
    <ContextProviders>
      <TitleManager />

      <ScreenRouter />
    </ContextProviders>
  );
};
