import { KartonProvider } from './hooks/karton';
import { SelectedElementsProvider } from './hooks/cdp-interop';
import type { ReactNode } from 'react';

export const Providers = ({ children }: { children: ReactNode }) => {
  return (
    <KartonProvider>
      <SelectedElementsProvider>{children}</SelectedElementsProvider>
    </KartonProvider>
  );
};
